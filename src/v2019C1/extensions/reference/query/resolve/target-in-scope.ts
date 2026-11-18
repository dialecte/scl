import { TARGET_IN_SCOPE_BEHAVIOR_TAG } from './target-in-scope.constants'

import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'
import { nameScopeOf } from '@/v2019C1/extensions/reference/query/build/name-scope'
import { getPathSegment } from '@/v2019C1/extensions/reference/query/build/path-segment'

import type { TargetInScopeParams } from './target-in-scope.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * Whether a reference whose path is read from its own place may still name its target, both where they are: an
 * `ancestor-name` target held by an element above the referrer, a `scoped-name` target in the referrer's own scope
 * element (`nameScope`), a `behavior-description` target at or below the element holding the referrer's behaviour.
 * Any other pair names its target from anywhere. Pure: the ancestries are given, outermost first.
 */
export function targetInScope(params: TargetInScopeParams): boolean {
	const { pair, referrerAncestry, target, targetAncestry } = params
	if (pair.resolution === RESOLUTION_TYPE.ancestorName) {
		const holder = targetAncestry.findLast(namesALevel)
		return holder !== undefined && referrerAncestry.some((record) => record.id === holder.id)
	}
	if (pair.resolution === RESOLUTION_TYPE.scopedName) {
		const nameScope = nameScopeOf(pair)
		const scopeOfReferrer = referrerAncestry.findLast((record) => record.tagName === nameScope)
		const scopeOfTarget = targetAncestry.findLast((record) => record.tagName === nameScope)
		return scopeOfReferrer !== undefined && scopeOfReferrer.id === scopeOfTarget?.id
	}
	if (pair.resolution === RESOLUTION_TYPE.behaviorDescription) {
		const context = behaviorContextOf({ referrerAncestry })
		return (
			context !== undefined &&
			(target.id === context.id || targetAncestry.some((record) => record.id === context.id))
		)
	}
	return true
}

/** Whether an element is a level of a path (it has a segment of its own). */
function namesALevel(record: AnyRawRecord): boolean {
	return getPathSegment(record) !== null
}

/** The element whose path a behaviour's references start below: the nearest level above that behaviour. */
function behaviorContextOf(params: {
	referrerAncestry: readonly AnyRawRecord[]
}): AnyRawRecord | undefined {
	const { referrerAncestry } = params
	const behavior = referrerAncestry.findLastIndex(
		(record) => record.tagName === TARGET_IN_SCOPE_BEHAVIOR_TAG,
	)
	if (behavior === -1) return undefined
	return referrerAncestry.slice(0, behavior).findLast(namesALevel)
}
