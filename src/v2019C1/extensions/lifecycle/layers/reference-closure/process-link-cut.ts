import { SPECIFICATION_LINK_TAGS } from '@/v2019C1/extensions/lifecycle/layers/ied/ied-process.constants'
import { readAttribute, readAttributes } from '@/v2019C1/helpers'

import type { ReferencePair } from '@/v2019C1/extensions/lifecycle/layers/ied/ied-process.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The one shape of a process reference whose link is cut, read by every caller (a file's export, a copy): the attributes
 * of the pair (`linkAttributes`) removed together, and the expected data an input or output specification lacked filled
 * from the LNode the cut link named (`expectedData`).
 */
export function cutPairLink(params: {
	record: AnyRawRecord
	pair: ReferencePair
	/** The LNode (or other element) the cut link named, when it is read. */
	target: AnyRawRecord | undefined
}): { attributes: Record<string, string | undefined>; removed: string[] } {
	const { record, pair, target } = params
	const attributes: Record<string, string | undefined> = expectedData({ record, pair, target })
	const removed: string[] = []
	for (const name of linkAttributes(pair)) {
		if (!readAttribute({ record, name, defaults: 'none', fullObject: true })) continue
		attributes[name] = undefined
		removed.push(name)
	}
	return { attributes, removed }
}

/** The expected data an input or output specification lacks, from the LNode its cut link named. None overwritten. */
export function expectedData(params: {
	record: AnyRawRecord
	pair: ReferencePair
	target: AnyRawRecord | undefined
}): Record<string, string> {
	const { record, pair, target } = params
	if (
		!SPECIFICATION_LINK_TAGS.has(record.tagName) ||
		!(pair.target as readonly string[]).includes('LNode')
	)
		return {}
	const attributes = readAttributes({ record, defaults: 'none' }) as Record<
		string,
		string | undefined
	>
	const [objectName, attributeName] = pair.companions.map(function valueOf(companion) {
		return attributes[companion.name]
	})
	const lnClass = target && readAttribute({ record: target, name: 'lnClass', defaults: 'none' })
	const filled: Record<string, string> = {}
	if (!attributes.pLN && lnClass) filled.pLN = lnClass
	if (!attributes.pDO && objectName) filled.pDO = objectName
	if (record.tagName === 'SourceRef' && !attributes.pDA && attributeName) filled.pDA = attributeName
	return filled
}

/** The attributes of a link: its uuid, its path, and what names the data at its target. */
export function linkAttributes(pair: ReferencePair): string[] {
	return [
		pair.attribute.uuid,
		pair.attribute.path,
		...pair.companions.map(function nameOf(companion) {
			return companion.name
		}),
	]
}
