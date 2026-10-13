import { splitLnodeQualifier } from '../resolve/parse-path'
import { joinPathParts } from './path-segment'

import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'

import type { ReferencePathParts } from './compose-reference-path.types'
import type { PathSegmentWithRef } from './path-segment.types'
import type { ReferencePair } from '@/v2019C1/extensions/reference'

type AttributeList = ReferencePathParts['referenceAttributes']

/**
 * The path value a reference stores, from its parts. Pure: the record hooks gather the parts
 * through a query (`buildReferencePath`), the import hooks from the records they stream.
 *
 * - `direct` / `ied-address` / `unsupported`: the target's path.
 * - `lnode`: the target's path, then the DO[.DA] of the companions (see below).
 * - `behavior-description`: the local path from the BehaviorDescription's parent down to the
 *   target, that parent left out (`Trip` from the LNode holding the input, `PTRC1.Trip` from its
 *   Function), then the companions' DO[.DA] for `dataName`; `null` when the target is not below
 *   that parent.
 */
export function composeReferencePath(parts: ReferencePathParts): string | null {
	const { pair, referenceAttributes, targetPath, behaviorContext } = parts

	if (pair.resolution === RESOLUTION_TYPE.behaviorDescription) {
		if (!behaviorContext) return null
		return composeBehaviorLocalPath({ pair, referenceAttributes, targetPath, behaviorContext })
	}

	const basePath = targetPath.path
	if (pair.resolution !== RESOLUTION_TYPE.lnode) return basePath

	// No path yet (the reference was written with its uuid only): the path names the data the
	// companions name, as the uuid form does.
	const currentValue = currentPathValue(referenceAttributes, pair)
	if (!currentValue) {
		const companionQualifier = qualifierFromCompanions(referenceAttributes, pair)
		return companionQualifier ? `${basePath}.${companionQualifier}` : basePath
	}
	// A path that stops at the LN level is a valid companions-only form (the DO/DA lives in the
	// companion attributes); leave it at that level. Only when the path already carries a DO/DA
	// qualifier do the companions drive its value.
	const currentQualifier = splitLnodeQualifier(currentValue).qualifier
	if (!currentQualifier) return basePath
	const qualifier = qualifierFromCompanions(referenceAttributes, pair) ?? currentQualifier
	return `${basePath}.${qualifier}`
}

function composeBehaviorLocalPath(
	parts: Required<Pick<ReferencePathParts, 'behaviorContext'>> & ReferencePathParts,
): string | null {
	const { pair, referenceAttributes, targetPath, behaviorContext } = parts

	const local = localSegments({ context: behaviorContext, segments: targetPath.segments })
	if (!local) return null

	const pieces = [
		local.length > 0 ? joinPathParts(local) : undefined,
		qualifierFromCompanions(referenceAttributes, pair),
	].filter((piece): piece is string => Boolean(piece))
	return pieces.length > 0 ? pieces.join('.') : null
}

/** The segments of `segments` below `context`, or `null` when `context` is not their prefix. */
function localSegments(params: {
	context: readonly PathSegmentWithRef[]
	segments: readonly PathSegmentWithRef[]
}): PathSegmentWithRef[] | null {
	const { context, segments } = params
	const isPrefix = context.every((part, index) => segments[index]?.ref.id === part.ref.id)
	return isPrefix ? segments.slice(context.length) : null
}

/**
 * The DO[.DA] qualifier from the companion name attributes (the authoritative expression of the
 * DO/DA), so a rebind done by editing `sourceDoName` / `sourceDaName` (or their peers) is
 * reflected in the path. `undefined` when no companion DO name is set.
 */
function qualifierFromCompanions(
	attributes: AttributeList,
	pair: ReferencePair,
): string | undefined {
	const [doCompanion, daCompanion] = pair.companions
	if (!doCompanion) return undefined
	const doValue = attributes.find((a) => a.name === doCompanion.name)?.value
	if (!doValue) return undefined
	const daValue = daCompanion
		? attributes.find((a) => a.name === daCompanion.name)?.value
		: undefined
	return daValue ? `${doValue}.${daValue}` : doValue
}

function currentPathValue(attributes: AttributeList, pair: ReferencePair): string | undefined {
	return attributes.find((a) => a.name === pair.attribute.path)?.value
}
