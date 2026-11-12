import { groupsOfApplicationInstance } from './application-groups'
import { cascadeComposedFunctions } from './cascade-composed-functions'
import {
	readCrossCuttingSatellites,
	reconcileCrossCuttingSatellites,
} from './cross-cutting-satellites'
import { reconcileSatellites } from './satellite-reconcile'
import { writesToInstance } from './writes-to-instance'

import { toRef } from '@dialecte/core/helpers'

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
import { landLevels, readTemplateLevels } from '@/v2019C1/extensions/lifecycle/layers/topology'
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

import type { UpdateAsdParams, WrittenApplications } from './asd.types'
import type { ApplicationInstance } from './cascade-composed-functions.types'
import type { Scl, Config } from '@/v2019C1/config'
import type {
	AppliedFunction,
	AppliedInstance,
} from '@/v2019C1/extensions/lifecycle/apply/apply.types'
import type { AcceptedIds } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type { DroppedElement } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { InstanceAdditions } from '@/v2019C1/extensions/lifecycle/engine/repoint-added-references.types'
import type { VariantSelection } from '@/v2019C1/extensions/lifecycle/layers/application'
import type * as Core from '@dialecte/core'

/**
 * `tx.lifecycle.update.asd` — reconcile a project against a (possibly newer) ASD.
 *
 * Same engine as `tx.lifecycle.update.fsd`, one layer up (proves `engine.reconcile` is
 * layer-agnostic): several instances of one ASD template may live under one
 * anchor, so EVERY matching `Application` instance is reconciled; if
 * none exists yet, the application is instantiated fresh.
 *
 * Two layers, in order:
 *  1. application layer — reconcile each `Application` subtree (roles, allocation
 *     refs, attributes);
 *  2. function-layer cascade — treat every composed Function the ASD
 *     references as an FSD to update and delegate to `tx.lifecycle.update.fsd`
 *     (instantiate-or-reconcile), per instance of the application
 *     ({@link cascadeComposedFunctions}). Verbs compose verbs: a function added by
 *     the newer ASD is instantiated for each instance, an existing one is reconciled.
 *
 * `report` + `decisions` gate every write: each Application instance is gated by
 * ONLY its own groups (partitioned by `instanceScopeId`) so the user can update a
 * subset of instances across both layers.
 *
 * Returns its roots, each saying how: `placed` for a first placement (the application, the functions it composes,
 * a function an instance gains), `reconciled` for a matched instance (an application, a function it composes or takes
 * where it stands). Given decisions, only those it wrote to; without decisions it writes everything the template
 * brings and returns every instance it matched.
 *
 * @intent update a project from a newer ASD, reconcile Application instances with their template, instantiate or update an application template
 */
export async function asd(
	tx: Core.Transaction<Config>,
	params: UpdateAsdParams,
): Promise<WrittenApplications> {
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
			sharedFunctions: params.sharedFunctions,
		})
		// first-time ASD clones the Application + composed Functions + satellites in one pass; annotate
		// every first-time report instance (Application and each composed Function) from the shared map
		const added = sourceToTargetMap(cloneMappings)
		for (const reportInstance of firstTimeReportInstances(report, { placedFor })) {
			annotateInstance({ reportInstance, added })
		}
		return {
			applications: application ? [{ ref: application, placement: 'placed' }] : [],
			functions: composedFunctionRefs.map(placedFunction),
		}
	}

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

	// the template's levels, read once: where they land for each instance is read from it
	const templateLevels = await readTemplateLevels(sourceQuery)
	for (const instance of instances) {
		// gate THIS instance by only its own groups (source ids are unique within one instance)
		const instanceGroups = groupsForInstance(report, instance.id)
		const accepted = decisions ? acceptedRefIds({ groups: instanceGroups, decisions }) : undefined
		const overrides = decisions
			? collisionOverrides({ groups: instanceGroups, decisions })
			: undefined

		applicationInstances.push({ instance, accepted })
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
		// where the template's levels land for this instance: a shared satellite is found by name only there
		// where this instance sits: what the template gained is written there, and found by name or lineage there only
		const instanceStructure = await resolveTargetStructure(
			tx,
			toRef(instance) as Scl.Ref<Scl.ElementsOf>,
		)
		const landings = landLevels({ levels: templateLevels, structure: instanceStructure })
		const resolvedMappings = await resolveSatelliteMappings(tx, {
			sourceQuery,
			satelliteRefs,
			instanceSatelliteRefs,
			decisionMappings: params.decisionMappings,
			matchKey,
			landings,
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

		const { cloneMappings: reconcileMappings } = await reconcile(tx, {
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
			structure: instanceStructure,
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
			// a variable or a behaviour description the template gained is written where this instance sits
			structure: instanceStructure,
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
	// functions it stands on is declined: its own reference names it (an application placed as part of a larger
	// template records that template's file, not its own)
	const rotated = new Set<string>()
	if (policy.writesProvenance && !params.partOfTemplate) {
		for (const instance of instances) {
			const brought = groupsOfApplicationInstance({
				report,
				instance,
				standsOn: cascade.standsOn.get(instance.id) ?? new Set(),
			})
			if (!followsSource({ groups: brought, decisions })) continue
			const { changed } = await writeProvenance(tx, {
				sourceQuery,
				target: {
					anchor: 'application',
					root: { tagName: 'Application', id: instance.id } as Scl.Ref<'Application'>,
				},
			})
			if (changed) rotated.add(instance.id)
		}
	}

	// the instances this write reconciled: one it wrote nothing to (see `writesToInstance`) is not an applied root —
	// else a consumer's post-apply step would run on an instance the user chose to leave as it is
	const applications: AppliedInstance<'Application'>[] = []
	for (const { instance, accepted } of applicationInstances) {
		const wrote = writesToInstance({ accepted, provenanceChanged: rotated.has(instance.id) })
		if (!wrote) continue
		applications.push({
			ref: { tagName: 'Application', id: instance.id } as Scl.Ref<'Application'>,
			placement: 'reconciled',
		})
	}
	return { applications, functions: cascade.functions }
}

/** A function a first placement of the application placed with it. */
function placedFunction(ref: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>): AppliedFunction {
	return { ref, placement: 'placed' }
}
