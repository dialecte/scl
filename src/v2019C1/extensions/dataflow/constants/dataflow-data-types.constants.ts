import { DATA_TYPE_MODEL } from '@/v2019C1/extensions/data-model/query/data-types.constants'

import type { CollectSelect } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry.types'

/**
 * What one read of the data types keeps: each type of the data model with its members, nothing
 * below a member (no value, text or enumeration of the document is read). Read from the data
 * model, so a type or member it gains is read with it.
 */
export const DATAFLOW_DATA_TYPES_SELECT: CollectSelect = {
	DataTypeTemplates: Object.fromEntries(
		[...DATA_TYPE_MODEL.types].map(([typeTag, type]) => [
			typeTag,
			Object.fromEntries([...type.members.keys()].map((memberTag) => [memberTag, {}])),
		]),
	),
}
