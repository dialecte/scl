import { stripAttributes } from '@dialecte/core/helpers'

import type { Config, Scl } from '@/v2019C1/config'
import type { CloneMapping, ExcludeFilter } from '@dialecte/core'

/** Attributes stripped from every cloned tree before persistence. */
export const STRIP_ATTRS = ['templateUuid', 'originUuid'] as const

/**
 * Full clone pipeline: getTree -> collectUuids -> strip -> deepClone -> buildRemap.
 * Returns the sourceUuid -> targetUuid remap.
 */
export async function cloneTreeWithRemap(
	tx: Scl.Transaction,
	params: {
		sourceQuery: Scl.Query
		ref: Scl.Ref<Scl.ElementsOf>
		targetParent: Scl.Ref<Scl.ElementsOf>
		exclude?: ExcludeFilter<Config>[]
	},
): Promise<Map<string, string>> {
	const { sourceQuery, ref, targetParent, exclude } = params

	const tree = await sourceQuery.getTree(ref, { exclude })
	if (!tree) return new Map()

	const sourceIdToUuid = collectUuidsByRecordId({ tree: tree as Scl.TreeRecord<Scl.ElementsOf> })
	const strippedTree = stripAttributes(tree, [...STRIP_ATTRS])
	// getTree on Scl.Ref<Scl.ElementsOf> includes 'SCL' in the union; deepClone requires
	// a child element. 'SCL' is the document root and never a cloned satellite.
	const { mappings } = await tx.deepClone(
		targetParent,
		strippedTree as Scl.TreeRecord<Exclude<Scl.ElementsOf, 'SCL'>>,
	)
	return buildUuidRemap({ tx, mappings, sourceIdToUuid })
}

/**
 * Recursively collects uuid attribute values keyed by record id.
 * Call on the source tree before deepClone strips uuid attrs.
 */
export function collectUuidsByRecordId(params: {
	tree: Scl.TreeRecord<Scl.ElementsOf>
	accumulator?: Map<string, string>
}): Map<string, string> {
	const { tree, accumulator = new Map() } = params

	const uuid = tree.attributes.find((a) => a.name === 'uuid')?.value
	if (uuid) accumulator.set(tree.id, uuid)

	for (const child of tree.tree)
		collectUuidsByRecordId({
			tree: child as unknown as Scl.TreeRecord<Scl.ElementsOf>,
			accumulator,
		})

	return accumulator
}

/**
 * Builds a sourceUuid → targetUuid remap from deepClone mappings.
 * Queries the target transaction for each target record's new uuid.
 */
export async function buildUuidRemap(params: {
	tx: Scl.Transaction
	mappings: CloneMapping<Config>[]
	sourceIdToUuid: Map<string, string>
}): Promise<Map<string, string>> {
	const { tx, mappings, sourceIdToUuid } = params

	const remap = new Map<string, string>()
	for (const { source, target } of mappings) {
		const sourceUuid = sourceIdToUuid.get(source.id ?? '')
		if (!sourceUuid) continue

		const targetRecord = await tx.getRecord(target)
		const targetUuid = targetRecord?.attributes.find((a) => a.name === 'uuid')?.value
		if (targetUuid && targetUuid !== sourceUuid) {
			remap.set(sourceUuid, targetUuid)
		}
	}
	return remap
}
/**
 * Recursively replaces uuid reference attribute values using the remap.
 * Operates on any set of attribute names (e.g. functionUuid, allocationRoleUuid).
 */
export function remapUuidAttrs<T extends Scl.ElementsOf>(params: {
	tree: Scl.TreeRecord<T>
	attributeNames: readonly string[]
	remap: Map<string, string>
}): Scl.TreeRecord<T> {
	const { tree, attributeNames, remap } = params

	if (remap.size === 0) return tree

	const attrSet = new Set(attributeNames)
	const attributes = tree.attributes.map((attr) =>
		attrSet.has(attr.name) && remap.has(attr.value)
			? { ...attr, value: remap.get(attr.value)! }
			: attr,
	)

	return {
		...tree,
		attributes,
		tree: tree.tree.map((child) =>
			remapUuidAttrs({
				tree: child as unknown as Scl.TreeRecord<Scl.ElementsOf>,
				attributeNames,
				remap,
			}),
		) as typeof tree.tree,
	}
}
