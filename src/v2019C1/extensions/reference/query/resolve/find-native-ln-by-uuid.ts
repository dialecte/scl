import { TRANSPARENT_TAGS } from '../find/collect-with-ancestry.constants'
import { toAnyRawRecord } from '../find/collect-with-ancestry.helpers'
import { compareDocumentOrder } from '../find/compare-document-order'
import { isNativeNode } from '../find/is-native-node'

import type { NativeLogicalNode } from './find-native-ln.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The document's own `LN` or `LN0` carrying a uuid, with its IED, without reading the document:
 * the elements carrying it are looked up and only those climbed. A logical node outside an IED or
 * in a vendor payload is no answer; of several, the first in document order.
 */
export async function findNativeLnByUuid(
	query: Core.Query<Config> | Core.Transaction<Config>,
	params: { uuid: string },
): Promise<NativeLogicalNode | undefined> {
	const { uuid } = params
	const lns = await query.findByAttributes({ tagName: 'LN', attributes: { uuid } })
	const ln0s = await query.findByAttributes({ tagName: 'LN0', attributes: { uuid } })
	const candidates: { found: NativeLogicalNode; chain: readonly AnyRawRecord[] }[] = []
	for (const match of [...ln0s, ...lns]) {
		const ancestors = await query.findAncestors(match)
		const ancestry = [...ancestors]
			.reverse()
			.filter((ancestor) => !TRANSPARENT_TAGS.has(ancestor.tagName))
			.map(toAnyRawRecord)
		const record = toAnyRawRecord(match)
		const ied = ancestry.find((ancestor) => ancestor.tagName === 'IED')
		if (!ied || !isNativeNode({ record, ancestry })) continue
		candidates.push({
			found: { ln: match as Scl.TrackedRecord<'LN' | 'LN0'>, ied: { tagName: 'IED', id: ied.id } },
			chain: [...ancestry, record],
		})
	}
	const [first] = candidates.sort((one, other) =>
		compareDocumentOrder({ first: one.chain, second: other.chain }),
	)
	return first?.found
}
