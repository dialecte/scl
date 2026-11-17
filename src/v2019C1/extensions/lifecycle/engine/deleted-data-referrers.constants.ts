import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'

/** The references naming data of an IED a newer template may delete: a data set entry and an input. */
export const DATA_REFERRER_TAGS = { entry: 'FCDA', input: 'ExtRef' } as const

/** The logical nodes whose data an entry names by its uuid. */
export const LOGICAL_NODE_TAGS: ReadonlySet<string> = new Set<string>(
	TUPLE_REFERENCE_PAIRS.FCDA[0].target,
)
