import { resolveElementPath } from './resolve-element-path'
import { resolveMappedDataFrom } from './resolve-mapped-data-from'
import { resolveMappedLNode } from './resolve-mapped-lnode'

import { MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference/constants'

import type { MappedDataAndDefault } from './resolve-mapped-data-and-default.types'
import type { MappedDataSource } from './resolve-mapped-data-from.types'
import type { ResolveMappedDataParams } from './resolve-mapped-data.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

type Reader = Core.Query<Config> | Core.Transaction<Config>
type DataRef = Scl.Ref<'DOS' | 'SDS' | 'DAS'>
type LnRef = Scl.Ref<'LN' | 'LN0'>

/**
 * The data that implements a `DOS` / `SDS` / `DAS` in a document, and the default it would
 * follow if it named nothing itself. The rules live in `resolveMappedDataFrom`; this reads
 * them from the document query.
 */
export async function resolveMappedDataAndDefault(
	query: Reader,
	params: ResolveMappedDataParams,
): Promise<MappedDataAndDefault> {
	return resolveMappedDataFrom(createQuerySource(query), { node: params.reference })
}

function createQuerySource(query: Reader): MappedDataSource<DataRef, LnRef> {
	return {
		async readNode(reference) {
			const attributeNames = MAPPED_NAME_REFS.get(reference.tagName)
			if (!attributeNames) return undefined
			const attributes: Record<string, string | undefined> = await query.getAttributes(reference)
			const ancestors = await query.findAncestors(reference)
			const parent = ancestors.find(
				(ancestor) => ancestor.tagName === 'DOS' || ancestor.tagName === 'SDS',
			)
			return {
				name: attributes.name,
				ix: attributes.ix,
				mappedName: attributes[attributeNames.path],
				mappedLnUuid: attributes[attributeNames.uuid],
				parent: parent && ({ tagName: parent.tagName, id: parent.id } as DataRef),
			}
		},
		async findLNodeLn(reference) {
			const ancestors = await query.findAncestors(reference)
			const lnode = ancestors.find((ancestor) => ancestor.tagName === 'LNode')
			if (!lnode) return undefined
			const { lnUuid } = await query.getAttributes(lnode as Scl.TrackedRecord<'LNode'>)
			if (lnUuid) return findLnByUuid(query, lnUuid)
			const ln = await resolveMappedLNode(query, lnode as Scl.TrackedRecord<'LNode'>)
			return ln && { tagName: ln.tagName, id: ln.id }
		},
		findLnByUuid: (uuid) => findLnByUuid(query, uuid),
		async findLnByPath(path) {
			const record = await resolveElementPath(query, path)
			if (record?.tagName !== 'LN' && record?.tagName !== 'LN0') return undefined
			return { tagName: record.tagName, id: record.id }
		},
	}
}

async function findLnByUuid(query: Reader, uuid: string): Promise<LnRef | undefined> {
	for (const tagName of ['LN', 'LN0'] as const) {
		const [match] = await query.findByAttributes({ tagName, attributes: { uuid } })
		if (match) return { tagName, id: match.id }
	}
	return undefined
}
