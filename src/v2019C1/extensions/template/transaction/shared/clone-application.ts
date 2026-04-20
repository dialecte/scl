import { cloneFunctionWithCategories } from './clone-function'
import { cloneReferencedRecords, findMissingReferencedRecords } from './clone-referenced'
import { remapUuidAttrs, STRIP_ATTRS } from './clone-utils'
import { ALWAYS_EXCLUDE } from './exclude-filters'

import { stripAttributes } from '@dialecte/core/helpers'
import { invariant } from '@dialecte/core/utils'

import { ALL_REF_UUID_ATTRIBUTES } from '@/v2019C1/constants'

import type { TemplateStructure } from './template.types'
import type { Scl } from '@/v2019C1/config'

/**
 * ASD content brick: clones an Application and all its satellites (Functions,
 * AllocationRoles, BehaviorDescriptions) into the target template structure.
 *
 * Returns the merged sourceUuid -> targetUuid remap.
 * Reusable by ISD extraction as the inner Application clone step.
 */
export async function cloneApplicationContent(
	tx: Scl.Transaction,
	params: {
		sourceQuery: Scl.Query
		applicationRef: Scl.Ref<'Application'>
		structure: TemplateStructure
	},
): Promise<Map<string, string>> {
	const { sourceQuery, applicationRef, structure } = params
	const substationRef: Scl.Ref<'Substation'> = {
		tagName: 'Substation',
		id: structure.Substation.id,
	}

	const tree = await sourceQuery.getTree(applicationRef, { exclude: ALWAYS_EXCLUDE })
	if (!tree) return new Map()

	// 1. Functions: resolve structural parent per function, clone with categories
	const missingFunctions = await findMissingReferencedRecords(tx, {
		sourceQuery,
		scopeRef: applicationRef,
		refTagName: 'FunctionRef',
		targetTagName: 'Function',
	})
	const functionRemap = new Map<string, string>()
	for (const ref of missingFunctions) {
		const targetParentRef = await resolveStructureRef(sourceQuery, ref, structure)
		const partial = await cloneFunctionWithCategories(tx, {
			sourceQuery,
			functionRef: ref,
			targetParentRef,
			exclude: ALWAYS_EXCLUDE,
		})
		for (const [k, v] of partial) functionRemap.set(k, v)
	}

	// 2. AllocationRoles
	const allocationRoleRemap = await cloneReferencedRecords(tx, {
		sourceQuery,
		scopeRef: applicationRef,
		refTagName: 'AllocationRoleRef',
		targetTagName: 'AllocationRole',
		targetParent: substationRef,
		exclude: ALWAYS_EXCLUDE,
	})

	// 3. BehaviorDescriptions
	const behaviorDescriptionRemap = await cloneReferencedRecords(tx, {
		sourceQuery,
		scopeRef: applicationRef,
		refTagName: 'BehaviorDescriptionRef',
		targetTagName: 'BehaviorDescription',
		targetParent: substationRef,
		exclude: ALWAYS_EXCLUDE,
	})

	// 4. Remap Application tree and persist
	const remap = new Map([...functionRemap, ...allocationRoleRemap, ...behaviorDescriptionRemap])
	const targetParent = await resolveStructureRef(sourceQuery, applicationRef, structure)
	const strippedTree = stripAttributes(tree, [...STRIP_ATTRS])
	const remappedTree = remapUuidAttrs({
		tree: strippedTree,
		attributeNames: ALL_REF_UUID_ATTRIBUTES,
		remap,
	})
	await tx.deepClone(targetParent, remappedTree as Scl.TreeRecord<'Application'>)

	return remap
}

// ── Resolve target structure ref matching the source-side structural ancestor ─

async function resolveStructureRef(
	sourceQuery: Scl.Query,
	ref: Scl.Ref<Scl.ElementsOf>,
	structure: TemplateStructure,
): Promise<Scl.Ref<'Substation'> | Scl.Ref<'VoltageLevel'> | Scl.Ref<'Bay'>> {
	const structureLevels = new Set<string>(['Substation', 'VoltageLevel', 'Bay'])
	const ancestors = await sourceQuery.findAncestors(ref, { stopAtTagName: 'Substation' })

	// Include the ref itself in case it IS a Substation (findAncestors excludes it)
	const all = [...ancestors, await sourceQuery.getRecord(ref)].filter(Boolean)
	const structureAncestor = all.find((a) => structureLevels.has(a!.tagName))
	invariant(structureAncestor, {
		key: 'ELEMENT_NOT_FOUND',
		detail: `No Substation/VoltageLevel/Bay ancestor found for ${ref.tagName}`,
	})

	const targetRecord = structure[structureAncestor.tagName as keyof TemplateStructure]
	invariant(targetRecord, {
		key: 'ELEMENT_NOT_FOUND',
		detail: `Unsupported structural ancestor: ${structureAncestor.tagName}`,
	})

	return { tagName: targetRecord.tagName, id: targetRecord.id } as
		| Scl.Ref<'Substation'>
		| Scl.Ref<'VoltageLevel'>
		| Scl.Ref<'Bay'>
}
