import type { ControlBlockNode, IedNode } from './ied-section.types'

export type DataCleanupCapabilityParams = {
	node: IedNode<'FCDA' | 'DataSet' | 'GSEControl' | 'SampledValueControl' | 'ReportControl'>
	services: readonly IedNode<'ConfDataSet' | 'GSESettings' | 'SMVSettings' | 'ReportSettings'>[]
	/** Control blocks that still name the data set. */
	senders?: readonly ControlBlockNode[]
}

export type DataCleanupCapability = 'modifiable' | 'fixed' | 'not-modifiable' | 'engright'
