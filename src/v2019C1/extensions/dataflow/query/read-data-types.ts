import { createDataTypeIndex } from '@/v2019C1/extensions/data-model/query/create-data-type-index'
import { DATA_TYPES_SELECT } from '@/v2019C1/extensions/data-model/query/data-types.constants'
import { collectWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry'

import type { Config } from '@/v2019C1/config'
import type { DataTypes } from '@/v2019C1/extensions/data-model/query/data-types.types'
import type * as Core from '@dialecte/core'

/**
 * Reads the data model of the document once: the `DataTypeTemplates` and what they hold, fed to the
 * index the import builds its own with, so both read a path alike.
 */
export async function readDataTypes(query: Core.Query<Config>): Promise<DataTypes> {
	const collected = await collectWithAncestry(query, {
		select: DATA_TYPES_SELECT,
	})
	const index = createDataTypeIndex()
	for (const record of collected.records) {
		index.add({ record, ancestry: collected.ancestryOf(record.id) })
	}
	return index.build()
}
