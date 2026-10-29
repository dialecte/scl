import { FRAME_OMIT_CHILD_TAGS, UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { CHILDREN } from '@/v2019C1/definition'

import type {
	HeldReferenceTag,
	ReferencePairsByTag,
	SatelliteReferenceLink,
} from './applied-satellites.types'

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

/**
 * The references naming nothing but a cross-cutting satellite by its uuid — a role's `VariableRef` and
 * `BehaviorDescriptionRef`, a behaviour description's `BehaviorReference` —, by reference tag.
 */
export const SATELLITE_REFERENCE_LINKS: ReadonlyMap<string, SatelliteReferenceLink> = new Map(
	Object.entries(UUID_REFERENCE_PAIRS as ReferencePairsByTag).flatMap(function satelliteReferences([
		tagName,
		pairs,
	]) {
		return pairs.flatMap(function namesSatellite(pair) {
			const namesSatellitesOnly = pair.target.every(function isSatelliteTag(target) {
				return CROSS_CUTTING_SATELLITE_TAGS.has(target)
			})
			return namesSatellitesOnly
				? [[tagName, { uuid: pair.attribute.uuid, targets: pair.target }] as const]
				: []
		})
	}),
)

/**
 * The references a cross-cutting satellite holds (its children the reference registry names), each with its pairs: what a
 * satellite applies to is read from them.
 */
export const SATELLITE_HELD_REFERENCES: readonly HeldReferenceTag[] =
	CROSS_CUTTING_SATELLITE_CONTAINERS.flatMap(function heldReferences(satelliteTag) {
		const children = CHILDREN[satelliteTag] as readonly string[]
		return children.flatMap(function asReference(tagName): HeldReferenceTag[] {
			const pairs = (UUID_REFERENCE_PAIRS as ReferencePairsByTag)[tagName]
			return pairs ? [{ satelliteTag, tagName, pairs }] : []
		})
	})
