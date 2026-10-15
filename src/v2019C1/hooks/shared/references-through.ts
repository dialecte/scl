import { rebuildReferencesByUuid } from './ref-entry-ops'

import { toRawRecord } from '@dialecte/core/helpers'

import { REF_ENTRIES_BY_TARGET } from '@/v2019C1/extensions/reference'
import { buildElementPath } from '@/v2019C1/extensions/reference/query/build'
import { buildOwnDerivedAttributes } from '@/v2019C1/extensions/reference/query/build/build-reference-attributes'
import { derivedAttributesFollowing } from '@/v2019C1/extensions/reference/query/build/compose-derived-attributes'
import { updatedOperation, withAttributeValues } from '@/v2019C1/hooks/shared/record-ops'

import type { Scl, Config } from '@/v2019C1/config'
import type { ElementPath } from '@/v2019C1/extensions/reference/query/build'
import type * as Core from '@dialecte/core'

/** Rebuild the paths of the references to `target`, found by its uuid. */
export async function rebuildReferencesTo(
	query: Core.Query<Config>,
	params: { target: Scl.Ref<Scl.ElementsOf> },
): Promise<Scl.Operation[]> {
	const { target } = params
	const record = await query.getRecord(target)
	const uuid = record ? await query.any.getAttribute(record, { name: 'uuid' }) : undefined
	if (!uuid) return []
	return rebuildReferencesByUuid(query, { uuid, target })
}

/**
 * Rewrite the attributes `element` writes from its own path (a connectivity node's `pathName`),
 * when they differ. Pass `elementPath` when it was already read.
 */
export async function rebuildOwnPathAttributes(
	query: Core.Query<Config>,
	params: { element: Scl.Ref<Scl.ElementsOf>; elementPath?: ElementPath },
): Promise<Scl.Operation[]> {
	const { element, elementPath } = params
	if (!derivedAttributesFollowing({ tagName: element.tagName, follows: 'self' })) return []

	const values = await buildOwnDerivedAttributes(query, { element, elementPath })
	const current = await query.getRecord(element)
	if (!current) return []

	const record = toRawRecord(current)
	const attributes = withAttributeValues(record.attributes, values)
	return attributes === record.attributes ? [] : [updatedOperation(record, attributes)]
}

/**
 * Rebuild the paths of every element below `record`: a change to its own segment changes theirs.
 * That is the paths of the references to each of them, and the attributes each writes from its
 * own path. An element that does both has its path read once.
 */
export async function rebuildPathsBelow(
	query: Core.Query<Config>,
	params: { record: Scl.Ref<Scl.ElementsOf> },
): Promise<Scl.Operation[]> {
	const { record } = params
	const descendants = await query.findDescendants(record)
	const operations: Scl.Operation[] = []

	for (const records of Object.values(descendants) as Scl.TrackedRecord<Scl.ElementsOf>[][]) {
		for (const descendant of records) {
			if (descendant.id === record.id) continue
			const operationsOfDescendant = await rebuildPathsOf(query, { descendant })
			operations.push(...operationsOfDescendant)
		}
	}

	return operations
}

/** The references to `descendant` and the attributes it writes from its own path, rebuilt. */
async function rebuildPathsOf(
	query: Core.Query<Config>,
	params: { descendant: Scl.TrackedRecord<Scl.ElementsOf> },
): Promise<Scl.Operation[]> {
	const { descendant } = params
	const element = { tagName: descendant.tagName, id: descendant.id } as Scl.Ref<Scl.ElementsOf>
	const isTarget = REF_ENTRIES_BY_TARGET.has(element.tagName)
	const writesOwnPath = Boolean(
		derivedAttributesFollowing({ tagName: element.tagName, follows: 'self' }),
	)
	if (!isTarget && !writesOwnPath) return []

	const elementPath = writesOwnPath ? await buildElementPath(query, element) : undefined
	const uuid = descendant.attributes.find((attribute) => attribute.name === 'uuid')?.value
	const referenceOps =
		isTarget && uuid
			? await rebuildReferencesByUuid(query, {
					uuid,
					target: element,
					targetPath: elementPath ?? undefined,
				})
			: []
	const ownOps = writesOwnPath
		? await rebuildOwnPathAttributes(query, { element, elementPath: elementPath ?? undefined })
		: []
	return [...referenceOps, ...ownOps]
}
