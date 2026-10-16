import { splitLnodeQualifier } from '../resolve/parse-path'
import { dataCompanionsOf } from './data-companions'
import { isFunctionScoped, pathBelowFunction } from './function-scope'
import { joinPathParts } from './path-segment'

import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'

import type { ReferencePathParts, ReferrerContext } from './compose-reference-path.types'
import type { ElementPath, PathSegmentWithRef } from './path-segment.types'
import type { ReferencePair } from '@/v2019C1/extensions/reference'

/**
 * The path value a reference stores, from its parts. Pure: the record hooks gather the parts
 * through a query (`buildReferencePath`), the import hooks from the records they stream.
 *
 * - `direct` / `unsupported`: the target's path.
 * - `ied-address`: where the target sits relative to the logical node the referrer's LNode is
 *   mapped to: its own address alone in that logical node (`Trip`), the path below the IED in
 *   another logical node of the same IED (`LD0/GGIO1.Trip`), the full path otherwise
 *   (`IED1/LD0/GGIO1.Trip`, an LNode not mapped to that IED, or a logical node held by the access
 *   point); `null` when the target has no address of its own. An `ExtCtrl` takes the same four forms.
 * - `lnode`: the target's path, then the DO[.DA] of the companions (see below).
 * - `ancestor-name`: the target's bare name (a ProcessResource named from a placeholder below it).
 * - a function-scoped pair (`scope: 'function'`, the references of a signal role): the same, from
 *   the target's Function down, the Function left out, every level joined with "/".
 * - `behavior-description`: the local path from the BehaviorDescription's parent down to the
 *   target, that parent left out (`Trip` from the LNode holding the input, `PTRC1.Trip` from its
 *   Function), then the companions' DO[.DA] for `dataName`; `null` when the target is not below
 *   that parent.
 */
export function composeReferencePath(parts: ReferencePathParts): string | null {
	const { pair, referenceAttributes, behaviorContext } = parts
	// A signal role's reference names the target from its Function down, the Function left out.
	const targetPath = isFunctionScoped(pair)
		? (pathBelowFunction(parts.targetPath) ?? parts.targetPath)
		: parts.targetPath

	if (pair.resolution === RESOLUTION_TYPE.behaviorDescription) {
		if (!behaviorContext) return null
		return composeBehaviorLocalPath({ pair, referenceAttributes, targetPath, behaviorContext })
	}

	// An id reference: the bare name of the target, which the reader looks up in its ancestors.
	if (pair.resolution === RESOLUTION_TYPE.ancestorName)
		return targetPath.segments.at(-1)?.segment ?? null

	if (pair.resolution === RESOLUTION_TYPE.iedAddress) {
		return composeIedAddressPath({ pair, targetPath, referrerContext: parts.referrerContext })
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

function composeIedAddressPath(params: {
	pair: ReferencePair
	targetPath: ElementPath
	referrerContext: ReferrerContext | undefined
}): string | null {
	const { pair, targetPath, referrerContext } = params
	const { segments } = targetPath
	const own = segments.at(-1)
	// a target without an address of its own has no segment: its path ends at its logical node
	if (!own || !(pair.target as readonly string[]).includes(own.ref.tagName)) return null

	const mappedLnPath = referrerContext?.mappedLnPath
	if (!mappedLnPath) return targetPath.path
	if (joinPathParts(segments.slice(0, -1)) === mappedLnPath) return own.segment
	// below the IED only from a logical device on: from a logical node held by the access point, `LN.intAddr`
	// would be read as an address of its own holding a dot
	const sameIed = segments[0].segment === mappedLnPath.split('/')[0]
	const belowLogicalDevice = segments[1]?.ref.tagName === 'LDevice'
	return sameIed && belowLogicalDevice ? joinPathParts(segments.slice(1)) : targetPath.path
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
	attributes: ReferencePathParts['referenceAttributes'],
	pair: ReferencePair,
): string | undefined {
	const { doAttribute, daAttribute } = dataCompanionsOf(pair)
	if (!doAttribute) return undefined
	const doValue = attributes.find((attribute) => attribute.name === doAttribute)?.value
	if (!doValue) return undefined
	const daValue = daAttribute
		? attributes.find((attribute) => attribute.name === daAttribute)?.value
		: undefined
	return daValue ? `${doValue}.${daValue}` : doValue
}

function currentPathValue(
	attributes: ReferencePathParts['referenceAttributes'],
	pair: ReferencePair,
): string | undefined {
	return attributes.find((attribute) => attribute.name === pair.attribute.path)?.value
}
