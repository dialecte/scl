import { isAssignedToIed } from '@/v2019C1/extensions/data-model/naming/lnode-naming'
import { boundKeyOf } from '@/v2019C1/extensions/data-model/naming/release-plan'
import { readIedKinds } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds'
import { readLogicalNodeIndex } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-lnodes'
import { readAttributes } from '@/v2019C1/helpers'

import type { SpecificationRelease } from './specification-release.types'
import type { Config } from '@/v2019C1/config'
import type { SpecificationLogicalNode } from '@/v2019C1/extensions/data-model/naming/lnode-naming.types'
import type * as Core from '@dialecte/core'

/**
 * What releasing LNodes specified on the IEDs named `iedNames` needs, read once: of each name held by exactly one IED
 * that is a specification IED, its logical nodes by name path (with their uuid); and which LNodes are bound to each
 * logical node of the document. The kinds of the IEDs (by tag), the logical nodes of the specification IEDs named
 * (one read, whatever their number) and the LNodes are each read once, whatever the number of LNodes released.
 *
 * @intent which logical node of its specification IED a released LNode goes back to, the S-IED LNs and the LNs already bound, read once for many releases
 */
export async function readSpecificationRelease(
	query: Core.Query<Config>,
	params: { iedNames: ReadonlySet<string> },
): Promise<SpecificationRelease> {
	const iedNames = [...params.iedNames].filter((iedName) => isAssignedToIed({ iedName }))
	if (iedNames.length === 0) return { logicalNodes: new Map(), boundBy: new Map() }

	const kinds = await readIedKinds(query)
	const wanted = new Set(iedNames)
	const holders = new Map<string, number>()
	for (const { name } of kinds) holders.set(name, (holders.get(name) ?? 0) + 1)
	const specificationIeds = kinds.filter(
		(classification) =>
			classification.kind === 'specification' &&
			wanted.has(classification.name) &&
			holders.get(classification.name) === 1,
	)
	const index = await readLogicalNodeIndex(query, {
		ieds: specificationIeds.map((classification) => classification.ied),
	})
	const uuidOf = new Map([...index.byUuid].map(([uuid, mapped]) => [mapped.ln.id, uuid]))
	const logicalNodes = new Map<string, SpecificationLogicalNode>(
		[...index.byPath].map(([path, mapped]) => [path, { uuid: uuidOf.get(mapped.ln.id) }]),
	)

	const lnodes = await query.getRecordsByTagName('LNode')
	const boundBy = new Map<string, string[]>()
	for (const lnode of lnodes) {
		const key = boundKeyOf({ lnodeAttributes: readAttributes({ record: lnode, defaults: 'none' }) })
		if (key) boundBy.set(key, [...(boundBy.get(key) ?? []), lnode.id])
	}
	return { logicalNodes, boundBy }
}
