import type { Scl } from '@/v2019C1/config'

export type SupervisionDependencyPlan = {
	fcdas: Scl.Ref<'FCDA'>[]
	emptyDataSets: Scl.Ref<'DataSet'>[]
	payloadDataSets: Scl.Ref<'DataSet'>[]
	consumers: {
		source: Scl.Ref<'ReportControl' | 'GSEControl' | 'SampledValueControl' | 'LogControl'>
		attributes: { datSet?: undefined; confRev?: string; logEna?: 'false' }
	}[]
}

/** How left-out logical nodes are named: by uuid, or by tuple address when a reference holds no uuid. */
export type OmittedLogicalNodes = { uuids: ReadonlySet<string>; addresses: ReadonlySet<string> }

/** A surviving DataSet that loses members: some remain, it holds other content, or nothing is left. */
export type AffectedDataSet = { id: string; outcome: 'kept' | 'payload' | 'empty' }
