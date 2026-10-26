import { TUPLE_REFERENCE_PAIRS, UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'

/**
 * Per reference tag, the attributes naming the uuid of the element it refers to — read from both registries of
 * references (those named by a path and a uuid, those named by a tuple of attributes beside a uuid).
 */
export const REFERENCE_UUID_ATTRIBUTES: ReadonlyMap<string, readonly string[]> = new Map(
	[...Object.entries(UUID_REFERENCE_PAIRS), ...Object.entries(TUPLE_REFERENCE_PAIRS)].map(
		([tagName, pairs]) => [tagName, pairs.map((pair) => pair.attribute.uuid)],
	),
)
