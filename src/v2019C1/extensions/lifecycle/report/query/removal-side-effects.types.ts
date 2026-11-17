import type { AnyRawRecord } from '@dialecte/core'

/** The LNodes of the project, read once for a whole report when a removal deletes a logical node. */
export type LNodeReads = { read: () => Promise<AnyRawRecord[]> }
