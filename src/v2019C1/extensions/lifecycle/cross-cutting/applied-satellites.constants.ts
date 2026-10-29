import { FRAME_OMIT_CHILD_TAGS } from '@/v2019C1/constants'

/**
 * CROSS-CUTTING satellite containers: elements that apply to ANY SCL element
 * (via a uuid reference into it) and therefore travel with WHATEVER subtree
 * contains their target — not owned by a single layer.
 *
 * v1 = `Variable` (via `VariableApplyTo.elementUuid`) and `BehaviorDescription`
 * (via `InputVar`/`OutputVar.lnodeUuid`). Only uuid-bound targets are covered;
 * XPath-selector variables (no `elementUuid`) need XPath resolution (see TO_DO.md)
 * and are deferred.
 */
export const CROSS_CUTTING_SATELLITE_CONTAINERS = ['Variable', 'BehaviorDescription'] as const

/** The tags of the cross-cutting satellite containers. */
export const CROSS_CUTTING_SATELLITE_TAGS: ReadonlySet<string> = new Set(
	CROSS_CUTTING_SATELLITE_CONTAINERS,
)

/**
 * What a topology frame places with all it holds (its functions, applications, their categories and roles): a satellite
 * inside one of them is carried by its clone; one a level of the frame holds is not (the frame leaves it out).
 */
export const FRAME_CARRIED_TAGS: ReadonlySet<string> = new Set(
	FRAME_OMIT_CHILD_TAGS.filter(function isCarried(tag) {
		return !CROSS_CUTTING_SATELLITE_TAGS.has(tag)
	}),
)
