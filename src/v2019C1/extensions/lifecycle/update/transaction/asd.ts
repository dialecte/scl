import { reconcileCrossCuttingSatellites } from './cross-cutting-satellites'
import { fsd as updateFsd } from './fsd'
import { reconcileSatellites } from './satellite-reconcile'

import {
	annotateInstance,
	sourceToTargetMap,
} from '@/v2019C1/extensions/lifecycle/engine/correlate'
import {
	acceptedRefIds,
	collisionOverrides,
	groupsForInstance,
	reportInstanceById,
} from '@/v2019C1/extensions/lifecycle/engine/decide'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import { repointAddedReferences } from '@/v2019C1/extensions/lifecycle/engine/repoint-added-references'
import {
	collectComposedFunctionUuids,
	findInstancesByTemplateUuid,
	scopeToTargetInstance,
} from '@/v2019C1/extensions/lifecycle/instance'
import {
	asd as instantiateAsd,
	resolveTargetStructure,
} from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { resolveApplicationSatellites } from '@/v2019C1/extensions/lifecycle/layers/application'
import {
	findWithdrawnContributions,
	resolveSatelliteMappings,
	toRedirectMappings,
} from '@/v2019C1/extensions/lifecycle/mapping'
import {
	identityModeForScenario,
	matchKeyForScenario,
} from '@/v2019C1/extensions/lifecycle/scenario'
import { resolveStructureRef } from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type { Scl, Config } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { InstanceAdditions } from '@/v2019C1/extensions/lifecycle/engine/repoint-added-references.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type * as Core from '@dialecte/core'

/**
 * `update.fromAsd` — reconcile a project against a (possibly newer) ASD.
 *
 * Same engine as `update.fromFsd`, one layer up (proves `engine.reconcile` is
 * layer-agnostic): several instances of one ASD template may live under one
 * anchor, so EVERY matching `Application` instance is reconciled; if
 * none exists yet, the application is instantiated fresh.
 *
 * Two layers, in order:
 *  1. application layer — reconcile each `Application` subtree (roles, allocation
 *     refs, attributes);
 *  2. function-layer cascade — treat every composed Function the ASD
 *     references as an FSD to update and delegate to `update.fromFsd`
 *     (instantiate-or-reconcile), which fans out per composed-function instance.
 *     Verbs compose verbs: a function added by the newer ASD is instantiated, an
 *     existing one is reconciled.
 *
 * `report` + `decisions` gate every write: each Application instance is gated by
 * ONLY its own groups (partitioned by `instanceScopeId`) so the user can update a
 * subset of instances across both layers.
 */
export async function asd(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		targetParent: Scl.Ref<Scl.ElementsOf>
		/** `instantiate` forces a fresh instance; `template` (default) reconciles. */
		scenario?: LifecycleScenario
		report?: DiffReport
		decisions?: DecisionMap
		/** Type-dedup name authority, forwarded to `importTypes`. Default `'target'`. */
		keepNameTypesFrom?: KeepNameTypesFrom
		/** Multi-instance anchor: scope to ONE target instance (or its subtree). Absent = all. */
		targetInstance?: Scl.Ref<Scl.ElementsOf>
		/** The consumer's choices for the shared elements the application refers to. */
		decisionMappings?: DecisionMappings
		/** The application is placed by this operation alone (an ASD): see `instantiate.asd`. */
		resolvePlacement?: boolean
	},
): Promise<{
	applications: Scl.Ref<'Application'>[]
	functions: (Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>)[]
}> {
	const {
		sourceQuery,
		applicationRef,
		targetParent,
		scenario,
		report,
		decisions,
		keepNameTypesFrom,
		targetInstance,
	} = params

	const { uuid: sourceUuid } = await sourceQuery.getAttributes(applicationRef)
	const matchKey = matchKeyForScenario(scenario)
	const identityMode = identityModeForScenario(scenario)
	// `instantiate` always places a NEW instance, so it never matches an existing one.
	const matched =
		scenario === 'instantiate'
			? []
			: await findInstancesByTemplateUuid(tx, { tagName: 'Application', sourceUuid, matchKey })
	const instances = await scopeToTargetInstance(tx, { instances: matched, targetInstance })
	const addedGroups = report ? allGroups(report) : []

	if (instances.length === 0) {
		// first-time = one added group; gate the whole instantiate on its acceptance
		const gate = decisions ? acceptedRefIds({ groups: addedGroups, decisions }) : undefined
		const gateOverrides = decisions
			? collisionOverrides({ groups: addedGroups, decisions })
			: undefined
		if (gate && !gate.sourceIds.has(applicationRef.id)) return { applications: [], functions: [] }
		const {
			applicationRef: application,
			composedFunctionRefs,
			cloneMappings,
		} = await instantiateAsd(tx, {
			sourceQuery,
			applicationRef,
			targetParent,
			overrides: gateOverrides,
			keepNameTypesFrom,
			decisionMappings: params.decisionMappings,
			resolvePlacement: params.resolvePlacement,
		})
		// first-time ASD clones the Application + composed Functions + satellites in one pass; annotate
		// every first-time report instance (Application and each composed Function) from the shared map
		const added = sourceToTargetMap(cloneMappings)
		for (const reportInstance of report?.instances ?? []) {
			if (!reportInstance.rootRef) annotateInstance({ reportInstance, added })
		}
		return { applications: [application], functions: composedFunctionRefs }
	}

	const structure = await resolveTargetStructure(tx, targetParent)
	const satelliteRefs = await resolveApplicationSatellites(sourceQuery, { applicationRef })

	// The instances this write actually reconciled. A fully-skipped instance (all its
	// groups skipped) is left untouched, so it is NOT an applied root and is excluded
	// from the returned `applications` — otherwise a consumer's post-apply policy
	// would run against instances the user chose to skip.
	const writtenInstances: Scl.Ref<'Application'>[] = []
	// what the update added to each instance, repointed once the composed functions exist (below)
	const additions: InstanceAdditions[] = []

	for (const instance of instances) {
		// gate THIS instance by only its own groups (source ids are unique within one instance)
		const instanceGroups = groupsForInstance(report, instance.id)
		const accepted = decisions ? acceptedRefIds({ groups: instanceGroups, decisions }) : undefined
		const overrides = decisions
			? collisionOverrides({ groups: instanceGroups, decisions })
			: undefined

		// fast track (no decisions) always writes; a decided instance writes only when at
		// least one of its groups is accepted.
		const wasWritten = !accepted || accepted.sourceIds.size > 0 || accepted.instanceIds.size > 0
		if (wasWritten) {
			writtenInstances.push({ tagName: 'Application', id: instance.id } as Scl.Ref<'Application'>)
		}

		// application-layer satellites (e.g. a referenced AllocationRole) travel with the
		// application group. Resolve the instance-side satellites BEFORE the reconcile below
		// (which may drop a satellite ref) so removals are still detectable.
		const instanceSatelliteRefs = await resolveApplicationSatellites(tx, {
			applicationRef: { tagName: 'Application', id: instance.id } as Scl.Ref<'Application'>,
		})

		// where the shared satellites land — the answer the report read. Resolved before the
		// application reconcile: its references to a project element a source element is mapped
		// onto are the template's references to that element.
		const resolvedMappings = await resolveSatelliteMappings(tx, {
			sourceQuery,
			satelliteRefs,
			instanceSatelliteRefs,
			decisionMappings: params.decisionMappings,
			matchKey,
		})
		const redirectMappings = await toRedirectMappings({
			sourceQuery,
			satelliteRefs,
			resolvedMappings,
		})

		// what the instance gave to a project element the template no longer brings anything for —
		// read from the instance as it is before the reconcile below changes its references
		const withdrawnContributions = await findWithdrawnContributions(tx, {
			instancePrimaryRef: instance,
			instanceSatelliteRefs,
			resolvedMappings,
			matchKey,
		})

		// 1. application layer
		const reconcileMappings = await reconcile(tx, {
			sourceQuery,
			sourceRootRef: applicationRef,
			instanceRootRef: instance,
			accepted,
			overrides,
			keepNameTypesFrom,
			matchKey,
			identityMode,
			redirectMappings,
		})
		const satelliteMappings = await reconcileSatellites(tx, {
			sourceQuery,
			satelliteRefs,
			instanceSatelliteRefs,
			structure,
			accepted,
			matchKey,
			identityMode,
			resolvedMappings,
			decisionMappings: params.decisionMappings,
		})
		for (const contribution of withdrawnContributions) {
			// gated on the removal the report announced for it
			if (accepted && !accepted.instanceIds.has(contribution.id)) continue
			const live = await tx.any.getRecord(contribution)
			if (live) await tx.any.delete(contribution)
		}
		// cross-cutting satellites (Variable / BehaviorDescription) applying to any element
		// in the Application subtree travel with the application group
		const cross = await reconcileCrossCuttingSatellites(tx, {
			sourceQuery,
			primaryRef: applicationRef,
			instancePrimaryRef: { tagName: 'Application', id: instance.id } as Scl.Ref<Scl.ElementsOf>,
			structure,
			accepted,
			matchKey,
			identityMode,
		})
		// carry the report->applied correlation onto this Application instance's report nodes (the
		// composed Functions are annotated by the FSD cascade below)
		const addedMappings = [...reconcileMappings, ...satelliteMappings, ...cross.cloneMappings]
		additions.push({
			instanceRootRef: instance,
			cloneMappings: addedMappings,
			redirectMappings: [...redirectMappings, ...cross.redirectMappings],
		})
		const reportInstance = reportInstanceById(report, instance.id)
		if (reportInstance) {
			annotateInstance({ reportInstance, added: sourceToTargetMap(addedMappings) })
		}
	}

	// 2. function-layer cascade — updateFsd fans out per composed-function instance
	const functions = await cascadeComposedFunctions(tx, {
		sourceQuery,
		applicationRef,
		targetParent,
		scenario,
		report,
		decisions,
		keepNameTypesFrom,
		targetInstance,
		decisionMappings: params.decisionMappings,
	})

	// 3. the references each instance gained now have every target they can point at: the
	// satellites added above and the composed functions the cascade placed
	for (const { instanceRootRef, cloneMappings, redirectMappings } of additions) {
		await repointAddedReferences(tx, { cloneMappings, instanceRootRef, matchKey, redirectMappings })
	}

	return {
		applications: writtenInstances,
		functions,
	}
}

/**
 * Function-layer cascade: treat every composed Function the ASD references as an
 * FSD to update and delegate to `update.fromFsd` (instantiate-or-reconcile).
 *
 * Each function is placed at its own mirrored structural level (resolved exactly
 * like `instantiate.asd`, via `resolveTargetStructure` + `resolveStructureRef`) —
 * not blindly under the ASD's `targetParent` — so a function that lives under a
 * different Substation/VoltageLevel/Bay than the anchor is found/placed correctly.
 */
async function cascadeComposedFunctions(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		targetParent: Scl.Ref<Scl.ElementsOf>
		scenario?: LifecycleScenario
		report?: DiffReport
		decisions?: DecisionMap
		keepNameTypesFrom?: KeepNameTypesFrom
		targetInstance?: Scl.Ref<Scl.ElementsOf>
		decisionMappings?: DecisionMappings
	},
): Promise<(Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>)[]> {
	const {
		sourceQuery,
		applicationRef,
		targetParent,
		scenario,
		report,
		decisions,
		keepNameTypesFrom,
		targetInstance,
	} = params
	const functionUuids = await collectComposedFunctionUuids(sourceQuery, applicationRef)
	if (functionUuids.size === 0) return []

	const structure = await resolveTargetStructure(tx, targetParent)

	const roots: (Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>)[] = []
	for (const functionUuid of functionUuids) {
		const [sourceFunction] = await sourceQuery.any.findByAttributes({
			tagName: 'Function',
			attributes: { uuid: functionUuid },
		})
		if (!sourceFunction) continue
		const functionRef = { tagName: 'Function', id: sourceFunction.id } as Scl.Ref<'Function'>
		const functionTargetParent = await resolveStructureRef(sourceQuery, functionRef, structure)
		const functionRoots = await updateFsd(tx, {
			sourceQuery,
			functionRef,
			targetParent: functionTargetParent,
			scenario,
			report,
			decisions,
			keepNameTypesFrom,
			targetInstance,
			decisionMappings: params.decisionMappings,
		})
		roots.push(...functionRoots)
	}
	return roots
}
