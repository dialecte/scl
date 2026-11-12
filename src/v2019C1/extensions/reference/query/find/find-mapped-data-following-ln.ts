import { resolveMappedDataAndDefault } from '../resolve/resolve-mapped-data-and-default'
import { resolveMappedLNodes } from '../resolve/resolve-mapped-lnodes'

import { MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference/constants'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The `DOS` / `SDS` / `DAS` that a logical node implements by default: they name nothing
 * themselves and follow it, through the `LNode` mapped to it or through a parent data whose
 * own pair names it. Records that name the logical node themselves carry its uuid and are
 * not repeated here.
 */
export async function findMappedDataFollowingLn(
	query: Core.Query<Config>,
	params: { ln: Scl.TrackedRecord<'LN' | 'LN0'> },
): Promise<Scl.TrackedRecord<Scl.ElementsOf>[]> {
	const { ln } = params
	const { uuid } = await query.getAttributes(ln)
	if (!uuid) return []

	const lnodes = await query.getRecordsByTagName('LNode')
	const mappedLNodes = await resolveMappedLNodes(query, { lnodes })
	const roots = [
		...lnodes.filter((lnode) => mappedLNodes.get(lnode.id)?.ln.id === ln.id),
		...(await findDataNamingLn(query, { uuid })),
	]

	const found = new Map<string, Scl.TrackedRecord<Scl.ElementsOf>>()
	for (const root of roots) {
		const descendants = (await query.findDescendants(root)) as Partial<
			Record<string, Scl.TrackedRecord<Scl.ElementsOf>[]>
		>
		for (const tagName of MAPPED_NAME_REFS.keys()) {
			for (const record of descendants[tagName] ?? []) {
				if (found.has(record.id)) continue
				const reference = { tagName: record.tagName, id: record.id } as Scl.Ref<
					'DOS' | 'SDS' | 'DAS'
				>
				const { mappedData } = await resolveMappedDataAndDefault(query, {
					reference,
					mappedLNodes,
				})
				if (mappedData?.origin === 'default' && mappedData.ln.id === ln.id) {
					found.set(record.id, record)
				}
			}
		}
	}
	return [...found.values()]
}

/** `DOS` / `SDS` whose own pair names the logical node: their children may follow it. */
async function findDataNamingLn(
	query: Core.Query<Config>,
	params: { uuid: string },
): Promise<(Scl.TrackedRecord<'DOS'> | Scl.TrackedRecord<'SDS'>)[]> {
	const { uuid } = params
	const dos = await query.findByAttributes({ tagName: 'DOS', attributes: { mappedLnUuid: uuid } })
	const sds = await query.findByAttributes({ tagName: 'SDS', attributes: { mappedLnUuid: uuid } })
	return [...dos, ...sds]
}
