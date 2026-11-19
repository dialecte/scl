import type { Scl } from '@/v2019C1/config'

/** The LNodes of the process section mapped to each logical node, by logical node id, in document order. */
export type LNodesByLogicalNode = ReadonlyMap<string, readonly Scl.Ref<'LNode'>[]>
