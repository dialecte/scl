import type { Scl } from '@/v2019C1/config'

/** A reference as a caller is about to write it: its tag, the attributes naming its target, its text (an IEDName). */
export type TupleReferenceDraft = {
	tagName: string
	attributes: Readonly<Record<string, string>>
	value?: string
}

/** One pair of a tuple reference whose names name exactly one element: the uuid attribute to write and that element. */
export type ResolvedTuplePair = {
	uuidAttribute: string
	uuid: string
	target: Scl.Ref<Scl.ElementsOf>
}

/** A tuple reference about to be written, and the element it will sit in. */
export type TupleToResolve = { reference: TupleReferenceDraft; parent: Scl.Ref<Scl.ElementsOf> }

/** The references `resolveTuples` resolves, each with the element it will sit in: answered in input order. */
export type ResolveTuplesParams = { references: readonly TupleToResolve[] }
