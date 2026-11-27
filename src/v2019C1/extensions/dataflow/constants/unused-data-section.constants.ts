import type { Config } from '@/v2019C1/config'
import type { TreeSelect } from '@dialecte/core'

const SERVICES_SELECT = {
	ConfDataSet: true,
	GSESettings: true,
	SMVSettings: true,
	ReportSettings: true,
} satisfies TreeSelect<Config, 'Services'>

export const UNUSED_DATA_SECTION_SELECT = {
	IED: {
		Services: SERVICES_SELECT,
		AccessPoint: {
			Services: SERVICES_SELECT,
			Server: { LDevice: { LN0: { DataSet: { FCDA: true } }, LN: { DataSet: { FCDA: true } } } },
		},
	},
} satisfies TreeSelect<Config, 'SCL'>
