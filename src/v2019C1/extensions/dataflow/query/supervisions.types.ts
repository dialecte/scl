import type { Supervision } from '../dataflow.types'

/** How one kind of control block is supervised: the class of the supervising logical node and its data object. */
export type SupervisionKind = { lnClass: string; dataObject: string }

/**
 * The supervisions of a document, read once per call: the first supervision (in document order) by
 * subscriber IED id, logical node class and the value naming a control block, with its position in
 * document order to pick the first of several values naming one control block.
 */
export type SupervisionIndex = ReadonlyMap<string, IndexedSupervision>

export type IndexedSupervision = { supervision: Supervision; position: number }
