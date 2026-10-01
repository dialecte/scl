import { resolveMappedData } from '../resolve/resolve-mapped-data'
import { resolveMappedLNode } from '../resolve/resolve-mapped-lnode'

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

	const roots = [
		...(await findLNodesMappedTo(query, { ln, uuid })),
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
				const mappedData = await resolveMappedData(query, { reference })
				if (mappedData?.origin === 'default' && mappedData.ln.id === ln.id) {
					found.set(record.id, record)
				}
			}
		}
	}
	return [...found.values()]
}

/** `LNode`s mapped to the logical node: by `lnUuid`, or by the identity they name. */
async function findLNodesMappedTo(
	query: Core.Query<Config>,
	params: { ln: Scl.TrackedRecord<'LN' | 'LN0'>; uuid: string },
): Promise<Scl.TrackedRecord<'LNode'>[]> {
	const { ln, uuid } = params
	const byUuid = await query.findByAttributes({ tagName: 'LNode', attributes: { lnUuid: uuid } })

	const { lnClass } = await query.getAttributes(ln)
	if (!lnClass) return byUuid
	const sameClass = await query.findByAttributes({ tagName: 'LNode', attributes: { lnClass } })
	const byIdentity: Scl.TrackedRecord<'LNode'>[] = []
	for (const lnode of sameClass) {
		const { lnUuid } = await query.getAttributes(lnode)
		if (lnUuid) continue
		const mappedLn = await resolveMappedLNode(query, lnode)
		if (mappedLn?.id === ln.id) byIdentity.push(lnode)
	}
	return [...byUuid, ...byIdentity]
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
