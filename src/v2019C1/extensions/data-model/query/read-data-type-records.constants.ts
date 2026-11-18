import { DATA_TYPE_MODEL } from './data-types.constants'

import { invariant } from '@dialecte/core/utils'

import { TYPE_ID_REFERENCE_PAIRS } from '@/v2019C1/extensions/reference/constants/type-id-pairs'

import type { TypeIdReferencePair } from '@/v2019C1/extensions/reference/constants/types'

/** The member tags of each type of the data model (none for a type with no member, as the enumeration type). */
export const MEMBER_TAGS_BY_TYPE: ReadonlyMap<string, readonly string[]> = new Map(
	[...DATA_TYPE_MODEL.types].map(([typeTag, type]) => [typeTag, [...type.members.keys()]]),
)

/** The type-id references of each member tag: the type each names, and on which condition. */
export const TYPE_REFERENCES_BY_MEMBER: ReadonlyMap<string, readonly TypeIdReferencePair[]> =
	new Map(
		[...MEMBER_TAGS_BY_TYPE.values()]
			.flat()
			.map((memberTag): [string, readonly TypeIdReferencePair[]] => [
				memberTag,
				(TYPE_ID_REFERENCE_PAIRS as Readonly<Record<string, readonly TypeIdReferencePair[]>>)[
					memberTag
				] ?? [],
			]),
	)

/** The attribute a type is named by, the one its referrers' type-id references resolve against. */
export const DATA_TYPE_ID_ATTRIBUTE: string = rootTypeIdAttribute()

function rootTypeIdAttribute(): string {
	const rootType = DATA_TYPE_MODEL.types.get(DATA_TYPE_MODEL.rootType)
	invariant(rootType, { key: 'ASSERTION_FAILED', detail: 'the data model holds its root type' })
	return rootType.idAttribute
}
