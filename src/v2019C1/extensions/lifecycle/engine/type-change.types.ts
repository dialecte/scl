import type { TypeFollower } from '@/v2019C1/extensions/data-model/transaction'
import type { TypeIdTarget } from '@/v2019C1/extensions/reference'

/** A type reference an update compares by the type it names: the attribute, and the tag of the type it names. */
export type FollowedTypeReference = { attribute: string; target: TypeIdTarget }

/** What one comparison run read of the types on one side: each type id's signature (`undefined`: the side lacks it). */
export type TypeSignaturesOfSide = {
	/** `elementSignature`'s cache, by type record. */
	signatures: Map<string, string>
	/** By type tag and id (`<tag>#<id>`). */
	byId: Map<string, string | undefined>
}

/** The types one diff or reconcile read on the template's side and the project's. */
export type TypeComparison = { source: TypeSignaturesOfSide; target: TypeSignaturesOfSide }

/** What one reconcile reads of the types, and the elements whose type it brings: imported once it is done. */
export type TypeFollowing = { comparison: TypeComparison; followers: TypeFollower[] }
