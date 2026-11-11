import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'
import { parseReferencePath } from '@/v2019C1/extensions/reference/query/resolve/parse-path'
import { readAttribute } from '@/v2019C1/helpers'

import type { ProcessIndex, ReferencePair } from './ied-process.types'
import type { SectionNode } from '@/v2019C1/extensions/dataflow/query/section-node.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The element of the section a link of a reference names: by its uuid; else by its path, an LNode's path read without
 * the data it names below the LNode (`…/PTRC1.Op.general` names the LNode `…/PTRC1`). `undefined` when it names nothing
 * of the section, `named: false` when the link is not set.
 */
export function linkTarget(params: {
	record: AnyRawRecord
	pair: ReferencePair
	index: ProcessIndex
}): { named: boolean; node: SectionNode | undefined } {
	const { record, pair, index } = params
	const uuid = readAttribute({ record, name: pair.attribute.uuid, defaults: 'none' })
	if (uuid) return { named: true, node: index.byUuid.get(uuid) }
	const path = readAttribute({ record, name: pair.attribute.path, defaults: 'none' })
	if (!path) return { named: false, node: undefined }
	if (pair.resolution !== RESOLUTION_TYPE.lnode)
		return { named: true, node: index.byPath.get(path) }
	const parsed = parseReferencePath({
		resolution: pair.resolution,
		pathAttribute: pair.attribute.path,
		pathValue: path,
	})
	return { named: true, node: parsed ? index.byPath.get(parsed.lookupKey) : undefined }
}
