import { findNativeLnByPath } from './find-native-ln-by-path'
import { findNativeLnByUuid } from './find-native-ln-by-uuid'
import { resolveMappedDataFrom } from './resolve-mapped-data-from'
import { resolveMappedLNode } from './resolve-mapped-lnode'

import { MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference/constants'

import type {
	MappedDataAndDefault,
	ResolveMappedDataAndDefaultParams,
} from './resolve-mapped-data-and-default.types'
import type { MappedDataSource } from './resolve-mapped-data-from.types'
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
	params: ResolveMappedDataAndDefaultParams,
): Promise<MappedDataAndDefault> {
	return resolveMappedDataFrom(createQuerySource(query, params), { node: params.reference })
}

function createQuerySource(
	query: Reader,
	params: ResolveMappedDataAndDefaultParams,
): MappedDataSource<DataRef, LnRef> {
	const { mappedLNodes } = params
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
			if (mappedLNodes) return mappedLNodes.get(lnode.id)?.ln
			const ln = await resolveMappedLNode(query, lnode as Scl.TrackedRecord<'LNode'>)
			return ln && { tagName: ln.tagName, id: ln.id }
		},
		findLnByUuid: (uuid) => findLnRefByUuid(query, uuid),
		async findLnByPath(path) {
			const found = await findNativeLnByPath(query, { path })
			return found && { tagName: found.ln.tagName, id: found.ln.id }
		},
	}
}

async function findLnRefByUuid(query: Reader, uuid: string): Promise<LnRef | undefined> {
	const found = await findNativeLnByUuid(query, { uuid })
	return found && { tagName: found.ln.tagName, id: found.ln.id }
}
