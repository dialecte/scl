import {
	boundLogicalNodeOf,
	specificationIedIndex,
	specifiedLNodeOf,
} from '@/v2019C1/extensions/data-model/naming/specification-ied'
import { iedKindOf } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds'
import { mappedLNodeKey } from '@/v2019C1/extensions/reference/query/resolve/mapped-lnode-key'
import { readAttribute, readAttributes } from '@/v2019C1/helpers'

import type { SpecificationIedImport } from './specification-ied-import.types'
import type { BoundLogicalNode } from '@/v2019C1/extensions/data-model/naming/specification-ied.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The specification IED of the LNodes of an import, by the rule of the commit (`specificationIedOf`): the pass notes
 * the IEDs, the file types of their own source files (an `IEDSourceFiles` directly under the IED) and the logical
 * nodes by uuid; the IEDs are classified once, after the pass. The import does not know its file's extension: an IED
 * is classified by its own source files only (`iedKindOf`), so an ICD file's IED, which lists none, reads as a
 * specification IED.
 */
export function createSpecificationIedImport(): SpecificationIedImport {
	const iedNames = new Map<string, string>()
	const fileTypesByIed = new Map<string, string[]>()
	const logicalNodesByUuid = new Map<string, BoundLogicalNode>()

	function collect(params: { record: AnyRawRecord; ancestry: readonly AnyRawRecord[] }): void {
		const { record, ancestry } = params
		const { tagName } = record
		if (tagName === 'IED') {
			iedNames.set(record.id, readAttribute({ record, name: 'name', defaults: 'none' }) ?? '')
			return
		}
		if (tagName === 'SclFileReference') {
			const [ied, list] = ancestry.slice(-2)
			const fileType = readAttribute({ record, name: 'fileType', defaults: 'none' })
			if (list?.tagName === 'IEDSourceFiles' && ied?.tagName === 'IED' && fileType)
				fileTypesByIed.set(ied.id, [...(fileTypesByIed.get(ied.id) ?? []), fileType])
			return
		}
		if (tagName !== 'LN' && tagName !== 'LN0') return
		const uuid = readAttribute({ record, name: 'uuid', defaults: 'none' })
		if (!uuid || logicalNodesByUuid.get(uuid)?.native) return
		// the first native logical node of a uuid wins over a copy in vendor payload
		const bound = boundLogicalNodeOf({ record, ancestry })
		if (bound.native || !logicalNodesByUuid.has(uuid)) logicalNodesByUuid.set(uuid, bound)
	}

	function resolver(): ReturnType<SpecificationIedImport['resolver']> {
		const kinds = [...iedNames].map(([iedId, name]) => ({
			iedId,
			name,
			kind: iedKindOf({ inIcdFile: false, fileTypes: fileTypesByIed.get(iedId) ?? [] }),
		}))
		const index = specificationIedIndex({ kinds })
		return function specificationIedOfLNode({ lnode }) {
			const key = mappedLNodeKey(lnode)
			return specifiedLNodeOf({
				lnodeAttributes: readAttributes({ record: lnode, defaults: 'none' }),
				boundLogicalNode: key?.kind === 'uuid' ? logicalNodesByUuid.get(key.uuid) : undefined,
				index,
			})
		}
	}

	return { collect, resolver }
}
