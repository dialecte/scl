import { TUPLE_TARGET_TAGS_BY_KIND } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.constants'

import type { Config } from '@/v2019C1/config'
import type { TreeSelect } from '@dialecte/core'

/**
 * What one read of the IED section keeps: the logical nodes of every access point and logical
 * device, with their inputs (ExtRef), outputs (ExtCtrl) and, in LN0, their control blocks with the
 * elements registering subscribers.
 */
const LOGICAL_NODE_SELECT = {
	Inputs: { ExtRef: true },
	Outputs: { ExtCtrl: true },
} satisfies TreeSelect<Config, 'LN'>

const LOGICAL_NODE_ZERO_SELECT = {
	...LOGICAL_NODE_SELECT,
	GSEControl: { IEDName: true },
	SampledValueControl: { IEDName: true },
	ReportControl: { RptEnabled: { ClientLN: true } },
} satisfies TreeSelect<Config, 'LN0'>

export const IED_SECTION_SELECT = {
	IED: {
		AccessPoint: {
			Server: { LDevice: { LN0: LOGICAL_NODE_ZERO_SELECT, LN: LOGICAL_NODE_SELECT } },
			LN: LOGICAL_NODE_SELECT,
		},
	},
} satisfies TreeSelect<Config, 'SCL'>

/** The logical nodes (`LN`, `LN0`) and logical devices of the IED section, read from the tuple references naming them. */
export const LOGICAL_NODE_TAGS: readonly string[] = TUPLE_TARGET_TAGS_BY_KIND.get('ln') ?? []
export const LOGICAL_DEVICE_TAGS: readonly string[] = TUPLE_TARGET_TAGS_BY_KIND.get('ld') ?? []
