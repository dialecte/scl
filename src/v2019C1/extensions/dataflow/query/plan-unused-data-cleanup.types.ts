import type { KeptCleanup } from '../transaction/unsubscribe.types'
import type { DataflowContext } from './dataflow-context.types'
import type { ControlBlockNode, IedNode } from './ied-section.types'
import type { SubscriptionBookkeeping } from './plan-subscription-bookkeeping.types'

export type PlanUnusedDataCleanupParams = {
	context: DataflowContext
	ending: readonly IedNode<'ExtRef'>[]
	bookkeeping: SubscriptionBookkeeping
}

export type ConfRevChange = {
	controlBlock: ControlBlockNode
	from: string
	to: string
}

export type UnusedDataCleanupPlan = {
	fcdas: IedNode<'FCDA'>[]
	dataSets: IedNode<'DataSet'>[]
	controlBlocks: ControlBlockNode[]
	confRevs: ConfRevChange[]
	kept: KeptCleanup[]
}
