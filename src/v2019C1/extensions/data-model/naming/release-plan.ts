import { isAssignedToIed, releasedNaming } from './lnode-naming'
import { BOUND_BY_PATH_KEY_PREFIX, BOUND_BY_UUID_KEY_PREFIX } from './release-plan.constants'

import { SPECIFIED_NAMING_ATTRIBUTES } from '@/v2019C1/constants'
import { buildMappedLNodePath } from '@/v2019C1/extensions/reference/query/build/build-mapped-lnode-path'

import type { ReleasedLNode } from './release-plan.types'
import type { SpecificationRelease } from '@/v2019C1/extensions/data-model/query/specification-release.types'

/**
 * The naming each LNode released gets (`releasedNaming`), by LNode id, in the order given: an LNode goes back to the
 * logical node of the specification IED its specified naming names only while no other LNode is bound to it (one
 * logical node implements one LNode): one held by any LNode not released is taken, whatever the others holding it;
 * the LNodes released give up the logical nodes they were bound to, and one an earlier LNode of the list went back
 * to is taken.
 */
export function planReleases(params: {
	lnodes: readonly ReleasedLNode[]
	release: SpecificationRelease
}): Map<string, Record<string, string | undefined>> {
	const { lnodes, release } = params
	const released = new Set(lnodes.map((lnode) => lnode.id))
	const taken = new Set(
		[...release.boundBy].flatMap(([key, holders]) =>
			holders.some((holder) => !released.has(holder)) ? [key] : [],
		),
	)
	const plan = new Map<string, Record<string, string | undefined>>()
	for (const lnode of lnodes) {
		const path = specifiedPathOf(lnode)
		const logicalNode = path ? release.logicalNodes.get(path) : undefined
		const keys = logicalNode && path ? logicalNodeKeys({ path, uuid: logicalNode.uuid }) : []
		const free = keys.length > 0 && keys.every((key) => !taken.has(key))
		const specificationLogicalNode = free ? logicalNode : undefined
		const naming = releasedNaming({ ...lnode, specificationLogicalNode })
		if (specificationLogicalNode && isAssignedToIed({ iedName: naming.iedName }))
			for (const key of keys) taken.add(key)
		plan.set(lnode.id, naming)
	}
	return plan
}

/**
 * The key naming the logical node an LNode is bound to: `uuid:<lnUuid>`, else `path:<name path>`; none for an LNode on
 * no IED.
 */
export function boundKeyOf(params: {
	lnodeAttributes: Readonly<Record<string, string | undefined>>
}): string | undefined {
	const { lnodeAttributes } = params
	if (!isAssignedToIed({ iedName: lnodeAttributes.iedName })) return undefined
	if (lnodeAttributes.lnUuid) return `${BOUND_BY_UUID_KEY_PREFIX}${lnodeAttributes.lnUuid}`
	const path = buildMappedLNodePath(lnodeAttributes)
	return path ? `${BOUND_BY_PATH_KEY_PREFIX}${path}` : undefined
}

/** The keys an LNode bound to a logical node would hold: by its name path, and by its uuid when it has one. */
function logicalNodeKeys(params: { path: string; uuid: string | undefined }): string[] {
	const { path, uuid } = params
	const byPath = `${BOUND_BY_PATH_KEY_PREFIX}${path}`
	return uuid ? [byPath, `${BOUND_BY_UUID_KEY_PREFIX}${uuid}`] : [byPath]
}

/** The name path of the logical node an LNode's specified naming names (its class the LNode's own when it has none). */
function specifiedPathOf(lnode: ReleasedLNode): string | null {
	const { specifiedAttributes, lnodeAttributes } = lnode
	if (!specifiedAttributes) return null
	const specified = Object.fromEntries(
		[...SPECIFIED_NAMING_ATTRIBUTES].map(([name, specifiedName]) => [
			name,
			specifiedAttributes[specifiedName] || undefined,
		]),
	)
	return buildMappedLNodePath({
		...specified,
		lnClass: specified.lnClass ?? lnodeAttributes.lnClass,
	})
}
