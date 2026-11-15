import type { TupleReferencePair } from '@/v2019C1/constants/reference-pairs.types'

/**
 * The pairs of a tuple reference whose names this extension writes, or whose uuid it fills, when
 * the reference is created or imported: all but the `followsOnly` ones (an LNode's `lnUuid`), whose
 * names the commit writes and whose uuid is never filled.
 */
export function pairsWrittenWhenSet(params: {
	pairs: readonly TupleReferencePair[]
}): readonly TupleReferencePair[] {
	return params.pairs.filter((pair) => isWrittenWhenSet({ pair }))
}

/** Whether this extension writes a pair's names (or its uuid) when the reference is created or imported. */
export function isWrittenWhenSet(params: { pair: TupleReferencePair }): boolean {
	return !params.pair.followsOnly
}
