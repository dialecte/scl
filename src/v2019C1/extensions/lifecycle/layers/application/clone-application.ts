import {
	cloneFunction,
	cloneFunctionCategories,
} from '@/v2019C1/extensions/lifecycle/layers/function'
import { findMappingPolicy, resolveMapping } from '@/v2019C1/extensions/lifecycle/mapping'
import {
	addChildrenTo,
	cloneAllReferencedTargets,
	findMissingReferencedRecords,
	cloneTree,
	resolveStructureRef,
	createAncestryResolver,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type { CloneApplicationContentResult } from './clone-application.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { OmitEntry } from '@dialecte/core'

/**
 * Application-layer take-over: clones an Application and all its satellites
 * (Functions, FunctionCategories, AllocationRoles, BehaviorDescriptions, ...) into
 * the target structure. Direction-agnostic — returns the full `CloneMapping[]` so
 * the calling operation applies identity policy (extract strips, instantiate stamps),
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
	},
): Promise<CloneApplicationContentResult> {
	const { sourceQuery, applicationRef, structure, omit, keepNameTypesFrom } = params
	const decisionMappings = params.decisionMappings

	// Source record id -> cloned target ref, accumulated as functions are cloned, so
	// step 3's satellites can be placed back under their owning function.
	const cloneIndex = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	const allMappings: Scl.CloneMapping[] = []

	// 1. Functions: resolve structural parent per function, clone tree + data model
	const missingFunctions = await findMissingReferencedRecords(tx, {
		sourceQuery,
		scopeRef: applicationRef,
		refTagName: 'FunctionRef',
		targetTagName: 'Function',
	})
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

	// 2. FunctionCategories: clone at source-side structural level
	for (const ref of missingFunctions) {
		const categoryMappings = await cloneFunctionCategories(tx, {
			sourceQuery,
			functionRef: ref,
			structure,
			stripCategoriesUuid: false,
		})
		allMappings.push(...categoryMappings)
	}

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
	})
	for (const reuse of roleReuse) cloneIndex.set(reuse.sourceId, reuse.existingRef)

	const REFS_ALREADY_HANDLED = new Set(['FunctionRef', 'FunctionCategoryRef'])
	const referencedMappings = await cloneAllReferencedTargets(tx, {
		sourceQuery,
		scopeTagName: 'Application',
		scopeRef: applicationRef,
		resolveTargetParent: createAncestryResolver({ sourceQuery, structure, cloneIndex }),
		alreadyCloned: new Set(cloneIndex.keys()),
		skip: REFS_ALREADY_HANDLED,
		omit,
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
	const redirectMappings: RedirectMapping[] = roleReuse.map((reuse) => ({
		sourceUuid: reuse.sourceUuid,
		target: reuse.existingRef,
	}))

	return { cloneMappings: allMappings, redirectMappings }
}

type AllocationRoleReuse = {
	sourceId: string
	sourceUuid: string
	existingRef: Scl.Ref<'AllocationRole'>
}

/**
 * Map each AllocationRole referenced by the Application onto the target role its mapping
 * resolves to, when there is one: the source role's `FunctionRef` allocations are added to
 * that role, and the reuse is recorded so the caller can (a) skip cloning a duplicate and
 * (b) repoint the references to it.
 */
async function mapAllocationRoles(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		decisionMappings?: DecisionMappings
	},
): Promise<AllocationRoleReuse[]> {
	const { sourceQuery, applicationRef, decisionMappings } = params

	const { AllocationRoleRef: refs = [] } = await sourceQuery.findDescendants(applicationRef, {
		collect: 'AllocationRoleRef',
	})

	const policy = findMappingPolicy('AllocationRole')
	if (!policy) return []

	const reuse: AllocationRoleReuse[] = []
	const seen = new Set<string>()
	for (const ref of refs) {
		const roleUuid = ref.attributes.find((a) => a.name === 'allocationRoleUuid')?.value
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
		})
		const existing = mapping.existing
		if (!existing) continue

		const existingRef: Scl.Ref<'AllocationRole'> = { tagName: 'AllocationRole', id: existing.id }
		await addChildrenTo(tx, {
			sourceQuery,
			source: { tagName: 'AllocationRole', id: sourceRole.id },
			target: existingRef,
			strip: false,
		})

		reuse.push({ sourceId: sourceRole.id, sourceUuid: roleUuid, existingRef })
	}
	return reuse
}
