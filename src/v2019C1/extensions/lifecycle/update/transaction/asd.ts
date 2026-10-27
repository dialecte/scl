import { groupsOfApplicationInstance } from './application-groups'
import { cascadeComposedFunctions } from './cascade-composed-functions'
import {
	readCrossCuttingSatellites,
	reconcileCrossCuttingSatellites,
} from './cross-cutting-satellites'
import { reconcileSatellites } from './satellite-reconcile'

import {
	annotateInstance,
	sourceToTargetMap,
} from '@/v2019C1/extensions/lifecycle/engine/correlate'
import {
	acceptedRefIds,
	collisionOverrides,
	firstTimeGroups,
	firstTimeReportInstances,
	followsSource,
	groupsForInstance,
	leftOutRefIds,
	reportInstanceById,
} from '@/v2019C1/extensions/lifecycle/engine/decide'
import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import {
	deleteDropped,
	resolveRemovalBase,
} from '@/v2019C1/extensions/lifecycle/engine/removal-base'
import { repointAddedReferences } from '@/v2019C1/extensions/lifecycle/engine/repoint-added-references'
import {
	collectForeignScopes,
	findByOwnUuid,
	findComposedFunctionRefs,
	findInstancesByTemplateUuid,
	scopeToTargetInstance,
} from '@/v2019C1/extensions/lifecycle/instance'
import { resolveTargetStructure } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { placeApplication } from '@/v2019C1/extensions/lifecycle/instantiate/transaction/asd'
import {
	findDroppedComposedFunctions,
	readVariantSelection,
	readVariantTemplate,
	resolveApplicationSatellites,
	resolveApplicationScope,
} from '@/v2019C1/extensions/lifecycle/layers/application'
import {
	assertMappingsDecided,
	resolveSatelliteMappings,
	resolveSatelliteRemovals,
	toRedirectMappings,
} from '@/v2019C1/extensions/lifecycle/mapping'
import {
	assertRevisionBaseFits,
	scenarioPolicy,
} from '@/v2019C1/extensions/lifecycle/scenario-policy'
import { writeProvenance } from '@/v2019C1/extensions/reference/transaction'

import type { ApplicationInstance } from './cascade-composed-functions.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { AcceptedIds } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { DroppedElement } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { InstanceAdditions } from '@/v2019C1/extensions/lifecycle/engine/repoint-added-references.types'
import type { VariantSelection } from '@/v2019C1/extensions/lifecycle/layers/application'
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
 *     (instantiate-or-reconcile), per instance of the application
 *     ({@link cascadeComposedFunctions}). Verbs compose verbs: a function added by
 *     the newer ASD is instantiated for each instance, an existing one is reconciled.
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
		/** Placed afresh by a larger operation: a new instance whatever the project holds. */
		placesFresh?: boolean
		/** The previous revision of the file, for a fork: see {@link LifecycleRevisionBase}. Refused by another scenario. */
		baseQuery?: Core.Query<Config>
		/** What tells a dropped element from the project's own, when the caller read it already (once per apply). */
		removalBase?: RemovalBase
		/** The lineages a reference of the project may pair by name on: see `PlaceholderLineages`. */
		placeholderLineages?: PlaceholderLineages
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
		/** Placed as part of a larger template: see `instantiate.asd`. */
		partOfTemplate?: boolean
		/**
		 * What a first placement is made for, when the report lists it once per instance of the unit
		 * of a larger template: that instance (the level it sits on) — the same before and after the
		 * write. Default: `targetParent`.
		 */
		placedFor?: Scl.Ref<Scl.ElementsOf>
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
	assertRevisionBaseFits({ scenario, baseQuery: params.baseQuery })
	const policy = scenarioPolicy({ scenario, placesFresh: params.placesFresh })
	const { matchKey, identityMode, bumpsCollisions, namesFollow } = policy
	const removalBase =
		params.removalBase ??
		(await resolveRemovalBase({ policy, sourceQuery, baseQuery: params.baseQuery }))
	// a new instance is placed whatever the project holds: no existing one is matched
	const matched = policy.matchesInstances
		? await findInstancesByTemplateUuid(tx, { tagName: 'Application', sourceUuid, matchKey })
		: []
	const instances = await scopeToTargetInstance(tx, { instances: matched, targetInstance })

	// placed keeping the file's uuids: an application of the project already carrying its uuid is its instance,
	// wherever it sits — reconciled as the update of that instance, even outside `targetInstance`: a uuid names one
	// element of a file, a second is never placed beside it
	if (instances.length === 0 && policy.placementIdentity === 'keep') {
		const owned = await findByOwnUuid(tx, { tagNames: ['Application'], uuid: sourceUuid })
		if (owned.length > 0) {
			return asd(tx, { ...params, placesFresh: false, targetInstance: undefined, removalBase })
		}
	}

	if (instances.length === 0) {
		// a first placement writes what the consumer did not leave out — decided by the groups of
		// this place when the report lists the placement per place. The report made the application
		// depend on the functions it composes: left out, the kept ones are placed without it.
		const placedFor = params.placedFor ?? targetParent
		const placementGroups = firstTimeGroups(report, { placedFor })
		const leftOut = decisions
			? leftOutRefIds({ groups: placementGroups, decisions }).sourceIds
			: undefined
		const gateOverrides = decisions
			? collisionOverrides({ groups: placementGroups, decisions })
			: undefined
		const composedRefs = await findComposedFunctionRefs(sourceQuery, applicationRef)
		if (leftOut && [applicationRef, ...composedRefs].every((ref) => leftOut.has(ref.id))) {
			return { applications: [], functions: [] }
		}
		const {
			applicationRef: application,
			composedFunctionRefs,
			cloneMappings,
		} = await placeApplication(tx, {
			sourceQuery,
			applicationRef,
			targetParent,
			scenario,
			overrides: gateOverrides,
			keepNameTypesFrom,
			decisionMappings: params.decisionMappings,
			resolvePlacement: params.resolvePlacement,
			partOfTemplate: params.partOfTemplate,
			leftOut,
		})
		// first-time ASD clones the Application + composed Functions + satellites in one pass; annotate
		// every first-time report instance (Application and each composed Function) from the shared map
		const added = sourceToTargetMap(cloneMappings)
		for (const reportInstance of firstTimeReportInstances(report, { placedFor })) {
			annotateInstance({ reportInstance, added })
		}
		return { applications: application ? [application] : [], functions: composedFunctionRefs }
	}

	const structure = await resolveTargetStructure(tx, targetParent)

	// The instances this write actually reconciled. A fully-skipped instance (all its
	// groups skipped) is left untouched, so it is NOT an applied root and is excluded
	// from the returned `applications` — otherwise a consumer's post-apply policy
	// would run against instances the user chose to skip.
	const writtenInstances: Scl.Ref<'Application'>[] = []
	// what the update added to each instance, repointed once the composed functions exist (below)
	const additions: InstanceAdditions[] = []
	// every instance the update went through, for the function-layer cascade
	const applicationInstances: ApplicationInstance[] = []
	// what belongs to the other instances of the application: an element the instances share (a
	// role) holds one reference per instance, and each instance reconciles its own
	const foreignScopes = await collectForeignScopes(tx, { instances: matched })
	// what this update already added for an earlier instance: that instance's too
	const addedForEarlierInstances = new Set<string>()
	// the functions the instances compose that the newer application no longer does — read before any reconcile
	// removes a reference to them — removed once the cascade ran
	const droppedByInstance = await findDroppedComposedFunctions(tx, {
		sourceQuery,
		applicationRef,
		instances,
		matchKey,
		removalBase,
	})
	const droppedFunctions: { dropped: DroppedElement[]; accepted: AcceptedIds | undefined }[] = []
	// what each instance's selection of variants leaves out of the template, by instance record id: read from the
	// instance before anything is written to it, as the report read it
	const selections = new Map<string, VariantSelection>()
	const template = await readVariantTemplate(sourceQuery, { applicationRef, namesFollow })

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
		applicationInstances.push({ instance, written: wasWritten })
		const selection = await readVariantSelection(tx, { template, instance, matchKey })
		selections.set(instance.id, selection)
		// what the application refers to outside it, but through what the selection leaves out
		const satelliteRefs = await resolveApplicationSatellites(sourceQuery, {
			applicationRef,
			leftOut: selection.within,
		})

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
		// a shared element nothing is decided for: nothing is written until the consumer chose
		assertMappingsDecided({ satelliteRefs, resolvedMappings })
		const redirectMappings = await toRedirectMappings({
			sourceQuery,
			satelliteRefs,
			resolvedMappings,
		})

		// what goes of the satellites the template no longer brings anything for — read from the
		// instance as it is before the reconcile below changes its references, as the report read it
		const removals = await resolveSatelliteRemovals(tx, {
			sourceQuery,
			instancePrimaryRef: instance,
			instanceSatelliteRefs,
			resolvedMappings,
			removalBase,
			matchKey,
		})
		droppedFunctions.push({ dropped: droppedByInstance.get(instance.id) ?? [], accepted })

		// 1. application layer
		// the cross-cutting satellites as the report read them, before the reconcile below
		// what the satellites' references may name: the application and the functions it composes, but what the
		// selection leaves out
		const scope = await resolveApplicationScope(sourceQuery, {
			applicationRef,
			leftOut: selection.leftOut,
		})
		const crossCutting = await readCrossCuttingSatellites(tx, {
			sourceQuery,
			primaryRef: applicationRef,
			instancePrimaryRef: { tagName: 'Application', id: instance.id } as Scl.Ref<Scl.ElementsOf>,
			matchKey,
			removalBase,
			selection,
			scope,
		})

		const reconcileMappings = await reconcile(tx, {
			sourceQuery,
			sourceRootRef: applicationRef,
			instanceRootRef: instance,
			accepted,
			overrides,
			keepNameTypesFrom,
			matchKey,
			identityMode,
			bumpsCollisions,
			removalBase,
			namesFollow,
			placeholderLineages: params.placeholderLineages,
			redirectMappings,
			notSelected: selection.leftOut,
		})
		const foreignScope = new Set([
			...(foreignScopes.get(instance.id) ?? []),
			...addedForEarlierInstances,
		])
		async function resolveForeignScope(): Promise<ReadonlySet<string>> {
			return foreignScope
		}
		const satelliteMappings = await reconcileSatellites(tx, {
			sourceQuery,
			satelliteRefs,
			removals,
			structure,
			accepted,
			matchKey,
			identityMode,
			bumpsCollisions,
			removalBase,
			namesFollow,
			placeholderLineages: params.placeholderLineages,
			resolvedMappings,
			decisionMappings: params.decisionMappings,
			resolveForeignScope,
			notSelected: selection.leftOut,
			scope,
		})
		// cross-cutting satellites (Variable / BehaviorDescription) applying to any element
		// in the Application subtree travel with the application group
		const cross = await reconcileCrossCuttingSatellites(tx, {
			sourceQuery,
			reading: crossCutting,
			structure,
			accepted,
			matchKey,
			identityMode,
			bumpsCollisions,
			removalBase,
			namesFollow,
			placeholderLineages: params.placeholderLineages,
			resolveForeignScope,
			selection,
		})
		// carry the report->applied correlation onto this Application instance's report nodes (the
		// composed Functions are annotated by the FSD cascade below)
		const addedMappings = [...reconcileMappings, ...satelliteMappings, ...cross.cloneMappings]
		for (const { target } of addedMappings) {
			if (target.id) addedForEarlierInstances.add(target.id)
		}
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
	const cascade = await cascadeComposedFunctions(tx, {
		sourceQuery,
		applicationRef,
		targetParent,
		applicationInstances,
		scenario,
		removalBase,
		placeholderLineages: params.placeholderLineages,
		report,
		decisions,
		keepNameTypesFrom,
		targetInstance,
		decisionMappings: params.decisionMappings,
		selections,
	})
	for (const { dropped, accepted } of droppedFunctions)
		await deleteDropped(tx, { dropped, accepted })

	// 3. the references each instance gained now have every target they can point at: the
	// satellites added above and the composed functions the cascade placed — for a function the
	// template gained, the one placed for that instance
	for (const { instanceRootRef, cloneMappings, redirectMappings } of additions) {
		const gainedFunctions = cascade.redirectMappings.get(instanceRootRef.id ?? '') ?? []
		await repointAddedReferences(tx, {
			cloneMappings,
			instanceRootRef,
			matchKey,
			redirectMappings: [...(redirectMappings ?? []), ...gainedFunctions],
		})
	}

	// 4. each instance now holds this revision of its template — unless every change the update brought to it and the
	// functions it composes is declined: its own reference names it (an application placed as part of a larger template
	// records that template's file, not its own)
	if (policy.writesProvenance && !params.partOfTemplate) {
		for (const instance of instances) {
			const brought = await groupsOfApplicationInstance(tx, { report, instance })
			if (!followsSource({ groups: brought, decisions })) continue
			await writeProvenance(tx, {
				sourceQuery,
				target: {
					anchor: 'application',
					root: { tagName: 'Application', id: instance.id } as Scl.Ref<'Application'>,
				},
			})
		}
	}

	return {
		applications: writtenInstances,
		functions: cascade.functions,
	}
}
