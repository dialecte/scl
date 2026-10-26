import { TYPE_ID_REFERRERS_BY_TARGET } from '@/v2019C1/extensions/reference'

import type { FollowedTypeReference } from './type-change.types'

/**
 * Per tag, the type references an update compares by the type they name rather than by its id: those naming a logical
 * node type (an `LNode`'s, an `LN`'s, an `LN0`'s `lnType`), whose closure the type import brings. Derived from the
 * type-id reference registry.
 */
export const FOLLOWED_TYPE_REFERENCES: ReadonlyMap<string, readonly FollowedTypeReference[]> =
	groupByReferrer()

function groupByReferrer(): Map<string, FollowedTypeReference[]> {
	const byTag = new Map<string, FollowedTypeReference[]>()
	for (const referrer of TYPE_ID_REFERRERS_BY_TARGET.get('LNodeType') ?? []) {
		const references = byTag.get(referrer.refTagName) ?? []
		references.push({ attribute: referrer.attribute, target: 'LNodeType' })
		byTag.set(referrer.refTagName, references)
	}
	return byTag
}
