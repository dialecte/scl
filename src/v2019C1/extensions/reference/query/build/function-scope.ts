import { joinPathParts } from './path-segment'

import { FUNCTION_SCOPE_TAGS } from '@/v2019C1/constants'

import type { ElementPath } from './path-segment.types'
import type { ReferencePair } from '@/v2019C1/extensions/reference/constants/types'

/** Whether a pair's path is relative to the target's Function (`scope: 'function'`). */
export function isFunctionScoped(pair: ReferencePair): boolean {
	return 'scope' in pair && pair.scope === 'function'
}

/**
 * A target's path below its Function, the nearest `FUNCTION_SCOPE_TAGS` element above it, that
 * Function left out, every level joined with "/" (`SF1/PTRC1/Trip`). `null` when no Function is
 * above the target.
 */
export function pathBelowFunction(targetPath: ElementPath): ElementPath | null {
	const functionIndex = targetPath.segments.findLastIndex((segment) =>
		FUNCTION_SCOPE_TAGS.has(segment.ref.tagName),
	)
	if (functionIndex === -1) return null
	const below = targetPath.segments
		.slice(functionIndex + 1)
		.map((segment) => ({ ...segment, separator: '/' as const }))
	if (below.length === 0) return null
	return { path: joinPathParts(below), segments: below }
}

/**
 * The path of the Function a target's function-scoped path starts below: its path down to the
 * nearest `FUNCTION_SCOPE_TAGS` element. `null` when there is none.
 */
export function functionBaseOf(path: ElementPath): string | null {
	const functionIndex = path.segments.findLastIndex((segment) =>
		FUNCTION_SCOPE_TAGS.has(segment.ref.tagName),
	)
	if (functionIndex === -1) return null
	return joinPathParts(path.segments.slice(0, functionIndex + 1))
}
