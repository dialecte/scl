import { updateProcessSection } from './process-section'

import {
	annotateInstance,
	sourceToTargetMap,
} from '@/v2019C1/extensions/lifecycle/engine/correlate'
import {
	collisionOverrides,
	followsSource,
	leftOutRefIds,
} from '@/v2019C1/extensions/lifecycle/engine/decide'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { resolveRemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base'
import { ssd as instantiateSsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import {
	hasScopeInstance,
	resolveSsdScope,
	resolveTopologyReconcilables,
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
 * The recipe of `tx.lifecycle.update.ssd` (which then releases what it wrote, see `public-recipes.ts`) - reconcile a project against a (possibly newer) SSD.
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
 */
export async function ssd(
	tx: Core.Transaction<Config>,
	params: UpdateSsdParams,
): Promise<WrittenApplications> {
	const { sourceQuery, scopeRef, targetParent, scenario, report, decisions } = params

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
	const { matchKey } = policy
	const removalBase =
		params.removalBase ??
		(await resolveRemovalBase({
			policy,
			sourceQuery,
			baseQuery: params.baseQuery,
			target: tx,
			within: scope.root,
		}))
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

	const written = await updateProcessSection(tx, {
		...params,
		scope,
		reconcilables: { applications: applicationRefs, standaloneFunctions },
		policy,
		removalBase,
	})

	// the project now holds this revision of the file: its Header lists it, in every scenario
	if (followsSource({ groups: report ? allGroups(report) : [], decisions })) {
		await writeProvenance(tx, { sourceQuery, target: { anchor: 'document', fileType: 'SSD' } })
	}

	return written
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
