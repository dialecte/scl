import type { AnyRawRecord } from '@dialecte/core'

/** A control block sending a changed data set, with the configuration revision it goes up to. */
export type ConfRevRaise = { block: AnyRawRecord; confRev: string }

/**
 * A control block sending a data set that goes: its `datSet` removed, and the configuration revision it goes up to
 * (none when its counter cannot rise).
 */
export type DataSetRemoval = { block: AnyRawRecord; confRev: string | undefined }
