import { splitLnodeQualifier } from '../resolve/parse-path'
import { buildElementPath } from './build-element-path'
import { getPathSegment } from './path-segment'

import { toRawRecord } from '@dialecte/core/helpers'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference'

import type { Scl, Config } from '@/v2019C1/config'
import type { ResolutionType, ReferencePair } from '@/v2019C1/extensions/reference'
import type * as Core from '@dialecte/core'

/**
 * Build the path value to store on a REF element's path attribute
 * when pointing at a given target.
 *
 * Derives resolution strategy and path attribute from `UUID_REFERENCE_PAIRS`
 * using `reference.tagName` + `target.tagName`. For lnode resolution,
 * reads the REF's current path value to preserve the DO/DA qualifier.
 *
 * `unsupported` marks a path we cannot *parse* (path -> target) during streaming
 * (e.g. `VariableApplyTo.element` may be an XPath). The reverse direction
 * (target -> path) is still buildable from the resolved target: we write a plain
 * name-path, which is a coherent single-target form (a simple name-path is also a
 * valid XPath) and keeps uuid + name references in agreement (61850-6 §8.5.6).
 *
 * @param query   - Active document query
 * @param params  - reference (the REF element) + target (the element it points to)
 * @returns The computed path value, or null if unresolvable
 */
export async function buildReferencePath(
	query: Core.Query<Config>,
	params: {
		reference: Scl.Ref<Scl.ElementsOf>
		target: Scl.Ref<Scl.ElementsOf>
	},
): Promise<string | null> {
	const { reference, target } = params

	const pair = findPair(reference.tagName, target.tagName)
	if (!pair) return null

	const resolution = pair.resolution as ResolutionType

	if (resolution === RESOLUTION_TYPE.behaviorDescription) {
		const record = await query.getRecord(target)
		if (!record) return null
		return getPathSegment(toRawRecord(record))?.segment ?? null
	}

	const elementPath = await buildElementPath(query, target)
	if (!elementPath) return null
	const basePath = elementPath.path

	if (resolution === RESOLUTION_TYPE.lnode) {
		const refRecord = await query.getRecord(reference)
		if (!refRecord) return basePath
		const currentValue = refRecord.attributes.find((a) => a.name === pair.attribute.path)?.value
		if (!currentValue) return basePath
		const { qualifier } = splitLnodeQualifier(currentValue)
		return qualifier ? `${basePath}.${qualifier}` : basePath
	}

	// direct + unsupported: the plain name-path to the target.
	return basePath
}

function findPair(referenceTagName: string, targetTagName: string): ReferencePair | null {
	const pairs = UUID_REFERENCE_PAIRS[referenceTagName as keyof typeof UUID_REFERENCE_PAIRS]
	if (!pairs) return null
	return pairs.find((p) => p.target.includes(targetTagName as never)) ?? null
}
