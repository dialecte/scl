import type { MoveWrite } from './moves.types'
import type { AnyRawRecord } from '@dialecte/core'

/** The moved roots of one namespace under one parent of another: wrapped together. */
export type WrapGroup = {
	parent: AnyRawRecord
	prefix: string
	children: readonly AnyRawRecord[]
}

/** What wrapping the moved roots writes: the wrappers created, and one write per record updated. */
export type WrapWrites = {
	created: readonly AnyRawRecord[]
	writes: readonly MoveWrite[]
}
