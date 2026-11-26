import { describe, expectTypeOf, it } from 'vitest'

import type { resolveTuple, resolveTuples } from './query/resolve/resolve-tuple'
import type { ResolvedTuplePair, TupleReferenceDraft, TupleToResolve } from '@/v2019C1'

describe('the types query.reference.resolveTuple and resolveTuples take and answer import from the package entry', () => {
	it('TupleReferenceDraft, TupleToResolve and ResolvedTuplePair from the package entry → the types the queries take and answer', () => {
		expectTypeOf<Parameters<typeof resolveTuple>[1]>().toEqualTypeOf<TupleToResolve>()
		expectTypeOf<TupleToResolve['reference']>().toEqualTypeOf<TupleReferenceDraft>()
		expectTypeOf<Awaited<ReturnType<typeof resolveTuple>>>().toEqualTypeOf<ResolvedTuplePair[]>()
		expectTypeOf<
			Parameters<typeof resolveTuples>[1]['references'][number]
		>().toEqualTypeOf<TupleToResolve>()
		expectTypeOf<Awaited<ReturnType<typeof resolveTuples>>>().toEqualTypeOf<ResolvedTuplePair[][]>()
	})
})
