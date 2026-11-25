import type { DataflowContext } from './dataflow-context.types'
import type { IedNode } from './ied-section.types'
import type { Scl } from '@/v2019C1/config'

export type CompanionsOfParams = { extRef: Scl.Ref<'ExtRef'> }

/**
 * An ExtRef of the IED section, read through the context of the call, with the ExtRefs of its logical node and the
 * signal each implementing element is linked to.
 */
export type CompanionsParams = {
	context: DataflowContext
	extRef: IedNode<'ExtRef'>
	inLogicalNode: readonly IedNode<'ExtRef'>[]
	signalOf: ReadonlyMap<string, Scl.Ref<'SourceRef' | 'ControlRef'>>
}
