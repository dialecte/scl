import {
	cloneFunction,
	cloneFunctionCategories,
} from '@/v2019C1/extensions/lifecycle/layers/function'
import {
	addChildrenTo,
	cloneAllReferencedTargets,
	findMissingReferencedRecords,
	cloneTree,
	resolveStructureRef,
	createAncestryResolver,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type { Scl, Config } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'
import type { OmitEntry } from '@dialecte/core'

/**
 * Application-layer take-over: clones an Application and all its satellites
 * (Functions, FunctionCategories, AllocationRoles, BehaviorDescriptions, ...) into
 * the target structure. Direction-agnostic — returns the full `CloneMapping[]` so
 * the calling operation applies identity policy (extract strips, instantiate stamps).
 *
 * UUID remapping is the caller's responsibility via `reference.applyUuidRemap` over the
 * returned mappings.
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
	},
): Promise<Scl.CloneMapping[]> {
	const { sourceQuery, applicationRef, structure, omit, keepNameTypesFrom } = params

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
		const mappings = await cloneFunction(tx, {
			sourceQuery,
			functionRef: ref,
			targetParentRef,
			omit,
			keepNameTypesFrom,
		})
		allMappings.push(...mappings)
		for (const mapping of mappings) {
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
	// AllocationRole is a name-keyed shared catalog: an incoming role whose name already
	// exists in the target is MAPPED onto the existing one (its FunctionRef allocations are
	// added there) rather than cloned as a duplicate; the Application's AllocationRoleRef is
	// repointed to the existing role after the Application tree is cloned (step 5).
	const roleReuse = await reuseAllocationRolesByName(tx, { sourceQuery, applicationRef })
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

	// 5. Repoint the cloned AllocationRoleRefs of any reused role onto the existing role
	// (the role was not cloned, so `applyUuidRemap` leaves the source uuid in place).
	for (const reuse of roleReuse) {
		const refs = await tx.findByAttributes({
			tagName: 'AllocationRoleRef',
			attributes: { allocationRoleUuid: reuse.sourceUuid },
		})
		for (const ref of refs) {
			await tx.update(
				{ tagName: 'AllocationRoleRef', id: ref.id },
				{ attributes: { allocationRoleUuid: reuse.existingUuid } },
			)
		}
	}

	return allMappings
}

type AllocationRoleReuse = {
	sourceId: string
	sourceUuid: string
	existingRef: Scl.Ref<'AllocationRole'>
	existingUuid: string
}

/**
 * Map each AllocationRole referenced by the Application onto an existing same-name role
 * in the target (name-keyed shared catalog): the source role's `FunctionRef` allocations
 * are added to the existing role, and the reuse is recorded so the caller can (a) skip
 * cloning a duplicate and (b) repoint the Application's `AllocationRoleRef`.
 */
async function reuseAllocationRolesByName(
	tx: Core.Transaction<Config>,
	params: { sourceQuery: Core.Query<Config>; applicationRef: Scl.Ref<'Application'> },
): Promise<AllocationRoleReuse[]> {
	const { sourceQuery, applicationRef } = params

	const { AllocationRoleRef: refs = [] } = await sourceQuery.findDescendants(applicationRef, {
		collect: 'AllocationRoleRef',
	})

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
		const name = sourceRole.attributes.find((a) => a.name === 'name')?.value
		if (!name) continue

		const [existing] = await tx.findByAttributes({
			tagName: 'AllocationRole',
			attributes: { name },
		})
		if (!existing) continue
		const existingUuid = existing.attributes.find((a) => a.name === 'uuid')?.value
		if (!existingUuid) continue

		const existingRef: Scl.Ref<'AllocationRole'> = { tagName: 'AllocationRole', id: existing.id }
		await addChildrenTo(tx, {
			sourceQuery,
			source: { tagName: 'AllocationRole', id: sourceRole.id },
			target: existingRef,
			strip: false,
		})

		reuse.push({ sourceId: sourceRole.id, sourceUuid: roleUuid, existingRef, existingUuid })
	}
	return reuse
}
