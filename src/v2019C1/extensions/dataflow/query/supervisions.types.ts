import type { Supervision } from '../dataflow.types'
import type { ControlBlockNode } from './ied-section.types'
import type { Scl } from '@/v2019C1/config'

/** How one kind of control block is supervised: the class of the supervising logical node and its data object. */
export type SupervisionKind = { lnClass: string; dataObject: string }

/**
 * The supervisions of a document, read once per call: the supervision of a control block in a
 * subscriber IED, each pair answered once in the call (many ExtRefs share one pair).
 */
export type SupervisionIndex = {
	supervisionOf: (params: SupervisionLookup) => Supervision | undefined
}

/** A control block and the subscriber IED whose supervision of it is looked up. */
export type SupervisionLookup = { controlBlock: ControlBlockNode; subscriber: Scl.Ref<'IED'> }

/** The first supervision (in document order) of a value naming a control block, with its position. */
export type IndexedSupervision = { supervision: Supervision; position: number }
