import type { AnyRawRecord } from '@dialecte/core'

/** The moved roots of one namespace under one parent of another: wrapped together. */
export type WrapGroup = {
	parent: AnyRawRecord
	prefix: string
	children: readonly AnyRawRecord[]
}
