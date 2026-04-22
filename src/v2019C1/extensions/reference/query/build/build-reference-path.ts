import { splitLnodeQualifier } from '../resolve/parse-path'
import { buildElementPath } from './build-element-path'
import { getPathSegment } from './path-segment'

import { toRawRecord } from '@dialecte/core/helpers'

import { RESOLUTION_TYPE, UUID_REFERENCE_PAIRS } from '@/v2019C1/extensions/reference'

import type { Scl } from '@/v2019C1/config'
import type { ResolutionType, ReferencePair } from '@/v2019C1/extensions/reference'

/**
 * Build the path value to store on a REF element's path attribute
 * when pointing at a given target.
 *
 * Derives resolution strategy and path attribute from `UUID_REFERENCE_PAIRS`
 * using `reference.tagName` + `target.tagName`. For lnode resolution,
 * reads the REF's current path value to preserve the DO/DA qualifier.
 *
 * @param query   - Active document query
 * @param params  - reference (the REF element) + target (the element it points to)
 * @returns The computed path value, or null if unresolvable
 */
export async function buildReferencePath(
	query: Scl.Query,
	params: {
		reference: Scl.Ref<Scl.ElementsOf>
		target: Scl.Ref<Scl.ElementsOf>
	},
): Promise<string | null> {
	const { reference, target } = params

	const pair = findPair(reference.tagName, target.tagName)
	if (!pair) return null

	const resolution = pair.resolution as ResolutionType
	if (resolution === RESOLUTION_TYPE.unsupported) return null

	if (resolution === RESOLUTION_TYPE.behaviorDescription) {
		const record = await query.getRecord(target)
		if (!record) return null
		return getPathSegment(toRawRecord(record))?.segment ?? null
	}

	const basePath = await buildElementPath(query, target)
	if (!basePath) return null

	if (resolution === RESOLUTION_TYPE.lnode) {
		const refRecord = await query.getRecord(reference)
		if (!refRecord) return basePath
		const currentValue = refRecord.attributes.find((a) => a.name === pair.attribute.path)?.value
		if (!currentValue) return basePath
		const { qualifier } = splitLnodeQualifier(currentValue)
		return qualifier ? `${basePath}.${qualifier}` : basePath
	}

	return basePath
}

function findPair(referenceTagName: string, targetTagName: string): ReferencePair | null {
	const pairs = UUID_REFERENCE_PAIRS[referenceTagName as keyof typeof UUID_REFERENCE_PAIRS]
	if (!pairs) return null
	return pairs.find((p) => p.target.includes(targetTagName as never)) ?? null
}
