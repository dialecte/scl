import type { AnyRawRecord } from '@dialecte/core'

/** A control block sending a changed data set, with the configuration revision it goes up to. */
export type ConfRevRaise = { block: AnyRawRecord; confRev: string }
