import { resolveApplicationScope } from './application-scope'
import { resolveSharedFunctions } from './resolve-shared-functions'
import { resolveApplicationSatellites } from './satellites'

import { toRef } from '@dialecte/core/helpers'
import { invariant } from '@dialecte/core/utils'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { contribute } from '@/v2019C1/extensions/lifecycle/engine/contribute'
import { leaveOutOfScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope'
import {
	cloneFunction,
	cloneFunctionCategories,
} from '@/v2019C1/extensions/lifecycle/layers/function'
import {
	assertMappingDecided,
	findMappingPolicy,
	resolveMapping,
} from '@/v2019C1/extensions/lifecycle/mapping'
import {
	cloneAllReferencedTargets,
	findMissingReferencedRecords,
	cloneTree,
	resolveStructureRef,
	createAncestryResolver,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { readAttribute } from '@/v2019C1/helpers'

import type {
	AllocationRoleReuse,
	CloneApplicationContentResult,
	TakenFunction,
} from './clone-application.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { SharedFunctions } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { OmitEntry } from '@dialecte/core'

/**
 * Application-layer take-over: clones an Application and all its satellites
 * (Functions, FunctionCategories, AllocationRoles, BehaviorDescriptions, ...) into
 * the target structure. Direction-agnostic — returns the full `CloneMapping[]`, lineage copied as the source holds
 * it, so the calling operation writes the identity of its direction (extract breaks the root's link, instantiate
 * stamps),
 * plus the redirect mappings of the shared elements that were mapped instead of cloned.
 *
 * UUID remapping is the caller's responsibility via `reference.applyUuidRemap` over the
 * returned mappings and redirect mappings.
 */
export async function cloneApplicationContent(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		structure: TargetStructure
		/** Child tags to drop from clones. Extract prunes (ALWAYS_OMIT); instantiate omits nothing. */
		omit?: OmitEntry<Config>[]
		keepNameTypesFrom?: KeepNameTypesFrom
		/** The consumer's choices for the shared elements the application refers to. */
		decisionMappings?: DecisionMappings
		/**
		 * The source elements the consumer left out (record ids): a function left out is not placed;
		 * the application left out is not placed, nor what only it refers to — the functions it
		 * composes that are kept are placed without it.
		 */
		leftOut?: ReadonlySet<string>
		/** The key a project element carries a source element's uuid in, to find what it lands on. Default `templateUuid`. */
		matchKey?: MatchKey
		/** Whether a function it composes stands on one the level already holds for another application. Default `clone`. */
		sharedFunctions?: SharedFunctions
	},
): Promise<CloneApplicationContentResult> {
	const { sourceQuery, applicationRef, structure, omit, keepNameTypesFrom, leftOut } = params
	const decisionMappings = params.decisionMappings
	const matchKey = params.matchKey ?? 'templateUuid'

	// Source record id -> cloned target ref, accumulated as functions are cloned, so
	// step 3's satellites can be placed back under their owning function.
	const cloneIndex = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	const allMappings: Scl.CloneMapping[] = []

	// 1. Functions: resolve structural parent per function, clone tree + data model
	const composedFunctions = await findMissingReferencedRecords(tx, {
		sourceQuery,
		scopeRef: applicationRef,
		refTagName: 'FunctionRef',
		targetTagName: 'Function',
	})
	const placedFunctions = composedFunctions.filter((ref) => !leftOut?.has(ref.id))
	// a function another application placed there with an identical template reference is stood on, when merged
	const shared =
		params.sharedFunctions === 'merge' && !leftOut?.has(applicationRef.id)
			? await standOnSharedFunctions(tx, {
					sourceQuery,
					applicationRef,
					functionRefs: placedFunctions,
					structure,
					decisionMappings,
					matchKey,
				})
			: { taken: [] }
	const takenIds = new Set(shared.taken.map((taken) => taken.sourceId))
	const missingFunctions = placedFunctions.filter((ref) => !takenIds.has(ref.id))
	for (const { sourceId, target } of shared.taken) cloneIndex.set(sourceId, target)
	for (const ref of missingFunctions) {
		const targetParentRef = await resolveStructureRef(sourceQuery, ref, structure)
		const cloneMappings = await cloneFunction(tx, {
			sourceQuery,
			functionRef: ref,
			targetParentRef,
			omit,
			keepNameTypesFrom,
		})
		allMappings.push(...cloneMappings)
		for (const mapping of cloneMappings) {
			if (mapping.source.id) cloneIndex.set(mapping.source.id, mapping.target)
		}
	}

	// 2. FunctionCategories: mapped onto the target's, or cloned at source-side structural level.
	// A category classifying several of the functions is placed once.
	const placedCategories = new Map<string, Scl.Ref<'FunctionCategory'>>()
	const categoryRedirectMappings: RedirectMapping[] = []
	for (const ref of missingFunctions) {
		const categories = await cloneFunctionCategories(tx, {
			sourceQuery,
			functionRef: ref,
			structure,
			decisionMappings,
			placedCategories,
			matchKey: params.matchKey,
		})
		allMappings.push(...categories.cloneMappings)
		categoryRedirectMappings.push(...categories.redirectMappings)
	}

	// the application left out: its functions are placed without it, nothing it refers to is
	// a reference to a function stood on names it
	const takenRedirectMappings: RedirectMapping[] = shared.taken.map(({ sourceUuid, target }) => ({
		sourceUuid,
		target,
	}))
	const redirectMappings = [...categoryRedirectMappings, ...takenRedirectMappings]
	if (leftOut?.has(applicationRef.id)) return { cloneMappings: allMappings, redirectMappings }

	// the references of the roles it refers to name what this placement places only: the application and the
	// functions it composes, but those left out
	const scope = await resolveApplicationScope(sourceQuery, { applicationRef, leftOut })
	const leaveOut = await leaveOutOfApplicationScope(sourceQuery, { applicationRef, scope, leftOut })

	// 3. All other referenced targets - derived from UUID_REFERENCE_PAIRS and DESCENDANTS.
	// Each is placed by mirroring its source hierarchy (under its owning function when it
	// has one), not flattened to Substation.
	//
	// AllocationRole is a SHARED element: an incoming role that maps onto a role of the target
	// (see `resolveMapping`) is not cloned — its FunctionRef allocations are added to that role,
	// and the references to it are repointed by the caller's remap (returned as `redirectMappings`). A role with
	// nothing to map onto is cloned like any referenced target.
	const roleReuse = await mapAllocationRoles(tx, {
		sourceQuery,
		applicationRef,
		decisionMappings,
		matchKey,
		scope,
		leftOut,
		redirectMappings: takenRedirectMappings,
	})
	for (const reuse of roleReuse) {
		cloneIndex.set(reuse.sourceId, reuse.existingRef)
		// the allocations added to the role are clones like any other: the caller's remap repoints them
		allMappings.push(...reuse.contributedMappings)
	}

	const REFS_ALREADY_HANDLED = new Set(['FunctionRef', 'FunctionCategoryRef'])
	const referencedMappings = await cloneAllReferencedTargets(tx, {
		sourceQuery,
		scopeTagName: 'Application',
		scopeRef: applicationRef,
		resolveTargetParent: createAncestryResolver({ sourceQuery, structure, cloneIndex }),
		alreadyCloned: new Set(cloneIndex.keys()),
		skip: REFS_ALREADY_HANDLED,
		omit,
		leaveOut,
	})
	allMappings.push(...referencedMappings)

	// 4. Clone Application tree
	const targetParent = await resolveStructureRef(sourceQuery, applicationRef, structure)
	const applicationClone = await cloneTree(tx, {
		sourceQuery,
		ref: applicationRef,
		targetParent,
		omit,
	})
	if (applicationClone) allMappings.push(...applicationClone.mappings)

	// References to a mapped role still carry the source uuid: the caller's remap repoints them
	// through `redirectMappings` (the role itself was not cloned, so no clone mapping covers it).
	redirectMappings.push(...roleReuse.flatMap((reuse) => reuse.redirectMappings))

	return { cloneMappings: allMappings, redirectMappings }
}

/**
 * Map each AllocationRole referenced by the Application onto the target role its mapping
 * resolves to, when there is one: what the source role contributes — its `FunctionRef` allocations
 * of what the placement places — is poured into that role (`contribute`, as the report reads it),
 * and the reuse is recorded so the caller can (a) skip cloning a duplicate and (b) repoint the
 * references to it.
 */
async function mapAllocationRoles(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		decisionMappings?: DecisionMappings
		matchKey: MatchKey
		/** What the roles' references may name: what the placement places. */
		scope: ContributionScope
		/** The source elements the consumer left out (record ids). */
		leftOut: ReadonlySet<string> | undefined
		/** The functions stood on: a role already allocating one is not given it twice. */
		redirectMappings: readonly RedirectMapping[]
	},
): Promise<AllocationRoleReuse[]> {
	const { sourceQuery, applicationRef, decisionMappings, matchKey, scope, leftOut } = params

	const { AllocationRoleRef: refs = [] } = await sourceQuery.findDescendants(applicationRef, {
		collect: 'AllocationRoleRef',
	})

	const policy = findMappingPolicy('AllocationRole')
	if (!policy) return []

	const reuse: AllocationRoleReuse[] = []
	const seen = new Set<string>()
	for (const ref of refs) {
		const roleUuid = readAttribute({ record: ref, name: 'allocationRoleUuid' })
		if (!roleUuid || seen.has(roleUuid)) continue
		seen.add(roleUuid)

		const [sourceRole] = await sourceQuery.findByAttributes({
			tagName: 'AllocationRole',
			attributes: { uuid: roleUuid },
		})
		if (!sourceRole) continue
		const mapping = await resolveMapping(tx, {
			sourceQuery,
			sourceRef: { tagName: 'AllocationRole', id: sourceRole.id },
			policy,
			decision: decisionMappings?.get(sourceRole.id),
			matchKey,
		})
		assertMappingDecided({
			sourceRef: { tagName: 'AllocationRole', id: sourceRole.id },
			resolved: mapping,
		})
		const existing = mapping.existing
		if (!existing) continue

		const existingRef: Scl.Ref<'AllocationRole'> = { tagName: 'AllocationRole', id: existing.id }
		const contributed = await contribute(tx, {
			sourceQuery,
			source: { tagName: 'AllocationRole', id: sourceRole.id },
			target: existingRef,
			scope,
			matchKey,
			leftOut,
			redirectMappings: params.redirectMappings,
		})

		reuse.push({
			sourceId: sourceRole.id,
			sourceUuid: roleUuid,
			existingRef,
			contributedMappings: contributed.cloneMappings,
			redirectMappings: contributed.redirectMappings,
		})
	}
	return reuse
}

/**
 * The references below the elements the application refers to (its roles) that name what its placement does not
 * place, with what the consumer left out: what is cloned of them is cloned without these.
 */
async function leaveOutOfApplicationScope(
	sourceQuery: Core.Query<Config>,
	params: {
		applicationRef: Scl.Ref<'Application'>
		scope: ContributionScope
		leftOut: ReadonlySet<string> | undefined
	},
): Promise<ReadonlySet<string>> {
	const { applicationRef, scope, leftOut } = params
	const satelliteRefs = await resolveApplicationSatellites(sourceQuery, { applicationRef, leftOut })
	const leaveOut = new Set(leftOut ?? [])
	for (const satelliteRef of satelliteRefs) {
		const outOfScope = await leaveOutOfScope(sourceQuery, {
			root: satelliteRef,
			scope,
			leftOut: undefined,
		})
		for (const id of outOfScope) leaveOut.add(id)
	}
	return leaveOut
}

/**
 * The functions the application composes that it stands on, where the level holds one placed for another application
 * with an identical template reference (`resolveSharedFunctions`): the one found is taken; several wait for the
 * consumer's choice — refused until made —; none, the function is placed.
 */
async function standOnSharedFunctions(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		functionRefs: readonly Scl.Ref<'Function'>[]
		structure: TargetStructure
		decisionMappings: DecisionMappings | undefined
		matchKey: MatchKey
	},
): Promise<{ taken: TakenFunction[] }> {
	const { sourceQuery, applicationRef, structure } = params
	const landing = await resolveStructureRef(sourceQuery, applicationRef, structure)
	const placedFor = await tx.any.getRecord(landing)
	if (!placedFor) return { taken: [] }
	const standings = await resolveSharedFunctions(tx, {
		sourceQuery,
		functionRefs: params.functionRefs,
		structure,
		placedFor,
		decisionMappings: params.decisionMappings,
		matchKey: params.matchKey,
	})
	const taken: TakenFunction[] = []
	for (const { child, standings: byInstance } of standings) {
		const standing = byInstance.get(placedFor.id)
		invariant(standing?.kind !== 'undecided', {
			key: SCL_ERRORS.MAPPING_UNDECIDED,
			meta: { sourceId: child.ref.id, tagName: child.ref.tagName, kind: 'shared' },
			detail: `which <Function> the application stands on for "${child.ref.id}" is not decided: several functions of that template qualify, choose one or have a new one placed`,
		})
		if (standing?.kind !== 'taken' || !child.lineage) continue
		taken.push({
			sourceId: child.ref.id,
			sourceUuid: child.lineage,
			target: toRef(standing.element) as Scl.Ref<Scl.ElementsOf>,
		})
	}
	return { taken }
}
