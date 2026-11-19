import { DATAFLOW_DATA_TYPES_SELECT } from '../constants/data-types.constants'

import { createDataTypeIndex } from '@/v2019C1/extensions/data-model/query/create-data-type-index'
import { collectWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry'

import type { Config } from '@/v2019C1/config'
import type { DataTypes } from '@/v2019C1/extensions/data-model/query/data-types.types'
import type * as Core from '@dialecte/core'

/**
 * Reads the data model of the document once: the types of the `DataTypeTemplates` and their
 * members, fed to the index the import builds its own with, so both read a path alike. The values
 * and texts of the document are not read.
 */
export async function readDataTypes(query: Core.Query<Config>): Promise<DataTypes> {
	const collected = await collectWithAncestry(query, {
		select: DATAFLOW_DATA_TYPES_SELECT,
	})
	const index = createDataTypeIndex()
	for (const record of collected.records) {
		index.add({ record, ancestry: collected.ancestryOf(record.id) })
	}
	return index.build()
}
