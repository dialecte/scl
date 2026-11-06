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
