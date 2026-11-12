import { asd as updateAsd } from './asd'
import { fsd as updateFsd } from './fsd'

import { toRef } from '@dialecte/core/helpers'

import {
	annotateInstance,
	sourceToTargetMap,
} from '@/v2019C1/extensions/lifecycle/engine/correlate'
import {
	acceptedRefIds,
	collisionOverrides,
	followsSource,
	groupsForInstance,
	leftOutRefIds,
} from '@/v2019C1/extensions/lifecycle/engine/decide'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import {
	deleteDropped,
	resolveRemovalBase,
} from '@/v2019C1/extensions/lifecycle/engine/removal-base'
import { repointAddedReferences } from '@/v2019C1/extensions/lifecycle/engine/repoint-added-references'
import { ssd as instantiateSsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import {
	findDroppedPrimaries,
	hasScopeInstance,
	resolveSsdScope,
	resolvePrimaryParents,
	reconcileTopologyFrame,
	resolveTopologyReconcilables,
	landGroundedTerminals,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import {
	assertRevisionBaseFits,
	scenarioPolicy,
} from '@/v2019C1/extensions/lifecycle/scenario-policy'
import { writeProvenance } from '@/v2019C1/extensions/reference/transaction'

import type { WrittenApplications } from './asd.types'
import type { UpdateSsdParams } from './ssd.types'
import type { Scl, Config } from '@/v2019C1/config'
import type {
	AppliedFunction,
	AppliedInstance,
} from '@/v2019C1/extensions/lifecycle/apply/apply.types'
import type * as Core from '@dialecte/core'

/**
 * `tx.lifecycle.update.ssd` - reconcile a project against a (possibly newer) SSD.
 *
 * Mirrors `tx.lifecycle.update.asd` one layer up:
 *  - **first-time** (no instance of any scope primary, or a forced `instantiate`) delegates to
 *    `tx.lifecycle.instantiate.ssd`, so the source is recorded ONCE at document level (`Header > SourceFiles`),
 *    consistent with the direct verb - not scattered per primary.
 *  - **reconcile** cascades to the per-primary update verbs: each Application via `tx.lifecycle.update.asd`
 *    (which cascades to its composed Functions) and each standalone Function via `tx.lifecycle.update.fsd`.
 *
 * `report` + `decisions` gate every write, partitioned per instance by the sub-verbs. The scope is the element
 * the consumer names, the unit its `TEMPLATE` scaffolding holds when it names that (see `resolveSsdScope`).
 *
 * Returns its applications and functions, each `placed` or `reconciled`, as `update.asd` and `update.fsd` return
 * them: given decisions only those written to, without decisions every one it placed or matched.
 *
 * @intent update a project from a newer SSD, reconcile a bay typical with its template, propagate an SSD change
 */
export async function ssd(
	tx: Core.Transaction<Config>,
	params: UpdateSsdParams,
): Promise<WrittenApplications> {
	const {
		sourceQuery,
		scopeRef,
		targetParent,
		scenario,
		report,
		decisions,
		keepNameTypesFrom,
		targetInstance,
	} = params

	const scope = await resolveSsdScope(sourceQuery, { ref: scopeRef })
	if (!scope) return { applications: [], functions: [] }
	const { root } = scope
	// a unit of the scope: it resolves, as the scope's own ref does, to the same units
	const [scopeUnit] = scope.units

	const { applications: applicationRefs, standaloneFunctions } = await resolveTopologyReconcilables(
		sourceQuery,
		{ scopeRef: root, leftOut: scope.leftOut },
	)

	assertRevisionBaseFits({ scenario, baseQuery: params.baseQuery })
	const policy = scenarioPolicy({ scenario })
	const { matchKey, identityMode, bumpsCollisions, namesFollow } = policy
	const removalBase =
		params.removalBase ??
		(await resolveRemovalBase({ policy, sourceQuery, baseQuery: params.baseQuery }))
	const firstTime =
		!policy.matchesInstances ||
		!(await hasScopeInstance(tx, {
			sourceQuery,
			scopeRef: root,
			applicationRefs,
			standaloneFunctions,
			matchKey,
			leftOut: scope.leftOut,
		}))

	if (firstTime) {
		const groups = report ? allGroups(report) : []
		const overrides = decisions ? collisionOverrides({ groups, decisions }) : undefined
		// what the consumer left out is not placed; the report made what it holds and what refers to
		// it depend on it, so the decisions leave those out too
		const leftOut = decisions ? leftOutRefIds({ groups, decisions }).sourceIds : undefined
		const { cloneMappings } = await instantiateSsd(tx, {
			sourceQuery,
			scopeRef: { tagName: scopeUnit.tagName, id: scopeUnit.id },
			targetParent,
			scenario,
			overrides,
			decisionMappings: params.decisionMappings,
			leftOut,
		})
		// first-time SSD clones the scope (frame + fn/app) in one pass; annotate every first-time
		// report instance (frame, applications, standalone functions) from the shared map
		const added = sourceToTargetMap(cloneMappings)
		for (const reportInstance of report?.instances ?? []) {
			if (!reportInstance.rootRef) annotateInstance({ reportInstance, added })
		}
		return collectInstances(cloneMappings)
	}

	const applications: AppliedInstance<'Application'>[] = []
	const functions: AppliedFunction[] = []

	// reconcile the topology frame's OWN content (BayType/equipment/attrs) before the fn/app
	// cascade; the fn/app tags are a boundary, so the cascade below owns them. Each frame
	// instance is gated by ONLY its own decision groups (from report.ssd) in the full track.
	const { additions: frameAdditions, instanceLevelsList } = await reconcileTopologyFrame(tx, {
		sourceQuery,
		scopeRef: root,
		matchKey,
		identityMode,
		bumpsCollisions,
		removalBase,
		namesFollow,
		placeholderLineages: params.placeholderLineages,
		report,
		decisions,
		targetInstance,
		decisionMappings: params.decisionMappings,
		leftOut: scope.leftOut,
	})

	// the applications and functions each instance holds that the newer template no longer does: the update
	// replaces the unit's applications, so a dropped one goes — gated on the removal its report announced
	for (const { instanceRootRef } of frameAdditions) {
		const dropped = await findDroppedPrimaries(tx, {
			sourceQuery,
			scopeRef: root,
			frameInstance: instanceRootRef,
			matchKey,
			removalBase,
			leftOut: scope.leftOut,
		})
		const accepted = decisions
			? acceptedRefIds({ groups: groupsForInstance(report, instanceRootRef.id ?? ''), decisions })
			: undefined
		await deleteDropped(tx, { dropped, accepted })
	}

	for (const applicationRef of applicationRefs) {
		const placement = await resolvePrimaryParents(tx, {
			sourceQuery,
			primaryRef: applicationRef,
			anchor: targetParent,
			unitId: root.id,
			instanceLevelsList,
			matchKey,
		})
		for (const { parent, placedFor } of placement.places) {
			// its level was left out: so is it (the report made it depend on that level)
			if (!parent) continue
			const result = await updateAsd(tx, {
				sourceQuery,
				applicationRef,
				targetParent: parent,
				placedFor,
				// a gained application is a fresh one in each instance, whatever another instance holds
				scenario,
				placesFresh: placement.gained,
				removalBase,
				placeholderLineages: params.placeholderLineages,
				// placed as part of the substation template: its provenance is the document's
				partOfTemplate: true,
				report,
				decisions,
				keepNameTypesFrom,
				targetInstance,
				decisionMappings: params.decisionMappings,
			})
			applications.push(...result.applications)
			functions.push(...result.functions)
		}
	}

	for (const functionRef of standaloneFunctions) {
		const placement = await resolvePrimaryParents(tx, {
			sourceQuery,
			primaryRef: functionRef,
			anchor: targetParent,
			unitId: root.id,
			instanceLevelsList,
			matchKey,
		})
		for (const { parent, placedFor } of placement.places) {
			if (!parent) continue
			const updated = await updateFsd(tx, {
				sourceQuery,
				functionRef,
				targetParent: parent,
				placedFor,
				scenario,
				placesFresh: placement.gained,
				removalBase,
				placeholderLineages: params.placeholderLineages,
				partOfTemplate: true,
				report,
				decisions,
				keepNameTypesFrom,
				targetInstance,
				decisionMappings: params.decisionMappings,
			})
			functions.push(...updated)
		}
	}

	// the references the frame gained can point at anything the cascade placed above; a terminal it gained on the
	// predefined grounded node names the grounded node of its level in that instance
	for (const [index, { instanceRootRef, cloneMappings }] of frameAdditions.entries()) {
		await repointAddedReferences(tx, { cloneMappings, instanceRootRef, matchKey })
		const placedLevels = new Map([
			...(instanceLevelsList[index] ?? []),
			[root.id, toRef(instanceRootRef) as Scl.Ref<Scl.ElementsOf>],
		])
		await landGroundedTerminals(tx, { sourceQuery, cloneMappings, placedLevels })
	}

	// the project now holds this revision of the file: its Header lists it, in every scenario
	if (followsSource({ groups: report ? allGroups(report) : [], decisions })) {
		await writeProvenance(tx, { sourceQuery, target: { anchor: 'document', fileType: 'SSD' } })
	}

	return { applications, functions }
}

/** The instantiated Application / Function roots, read off the clone mappings by tag: each placed. */
function collectInstances(cloneMappings: readonly Scl.CloneMapping[]): WrittenApplications {
	const applications: AppliedInstance<'Application'>[] = []
	const functions: AppliedFunction[] = []

	for (const mapping of cloneMappings) {
		if (mapping.target.tagName === 'Application') {
			applications.push({ ref: mapping.target as Scl.Ref<'Application'>, placement: 'placed' })
		} else if (mapping.target.tagName === 'Function' || mapping.target.tagName === 'SubFunction') {
			functions.push({
				ref: mapping.target as Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>,
				placement: 'placed',
			})
		}
	}

	return { applications, functions }
}
