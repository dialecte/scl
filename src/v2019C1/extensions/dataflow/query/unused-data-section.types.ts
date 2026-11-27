import type { IedNode } from './ied-section.types'

export type UnusedDataSection = {
	dataSets: readonly IedNode<'DataSet'>[]
	fcdas: readonly IedNode<'FCDA'>[]
	services: readonly IedNode<'ConfDataSet' | 'GSESettings' | 'SMVSettings' | 'ReportSettings'>[]
}
