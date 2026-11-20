import { readFileUuid } from '@/v2019C1/extensions/lifecycle/read-file-uuid'
import { REFERENCE_UUIDS_BY_TAG } from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'
import {
	findNamedRecords,
	uuidsNamedBy,
} from '@/v2019C1/extensions/reference/query/find/named-targets'

import type { RetargetUnresolved } from './diff.types'
import type {
	ReadRetargetUuidsParams,
	RetargetsInParams,
	UnresolvedRetargetsParams,
} from './reference-retargets.types'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * Whether an update re-targets references: a fork (`namesFollow: 'source'`) whose open document is a version of the
 * newer revision's file (both Headers name the same file, as an open ISD and its other version do). A fork into a
 * project keeps the references the project made. Reads the two Headers once.
 */
export async function retargetsIn(params: RetargetsInParams): Promise<boolean> {
	if (params.namesFollow !== 'source') return false
	const [fileUuid, sourceFileUuid] = await Promise.all([
		readFileUuid(params.target),
		readFileUuid(params.sourceQuery),
	])
	return fileUuid !== undefined && fileUuid === sourceFileUuid
}

/**
 * In a fork, the uuids the newer revision's references name (both registries, an LNode's binding included) that the
 * fork holds: what each holder given holds of them, one read of each target tag per holder. A reference whose uuid
 * differs from the open document's and names one of them is re-targeted by its uuid alone (`visibleAttributes`); the
 * commit's steps write its path or names from it.
 */
export async function readRetargetUuids(
	params: ReadRetargetUuidsParams,
): Promise<ReadonlySet<string>> {
	const named = flatten(params.sourceTree).flatMap((node) =>
		uuidsNamedBy({ tagName: node.tagName, attributes: node.attributes }),
	)
	if (named.length === 0) return new Set()
	const found = await Promise.all(
		params.holders.map(function namedIn(holder) {
			return findNamedRecords(holder, { named })
		}),
	)
	return new Set(found.flatMap((byUuid) => [...byUuid.keys()]))
}

/**
 * The references of an element the newer revision points at another uuid the fork does not hold (neither the open
 * document nor the revision): they keep the element they name, and the report says so.
 */
export function unresolvedRetargets(params: UnresolvedRetargetsParams): RetargetUnresolved[] {
	const { tagName, sourceAttributes, instanceAttributes, uuids } = params
	return (REFERENCE_UUIDS_BY_TAG.get(tagName) ?? []).flatMap(
		function unresolvedOf(reference): RetargetUnresolved[] {
			const uuid = sourceAttributes[reference.uuid]
			if (!uuid || uuid === instanceAttributes[reference.uuid] || uuids.has(uuid)) return []
			return [{ attribute: reference.uuid, uuid }]
		},
	)
}

/** A tree's nodes, the root first. */
function flatten(node: AnyTreeRecord): AnyTreeRecord[] {
	return [node, ...node.tree.flatMap(flatten)]
}
