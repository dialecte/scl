import { walkTree } from './walk-tree'

import { createDataTypeIndex } from '@/v2019C1/extensions/data-model/query/create-data-type-index'

import type { SectionNode, TreeNode } from './section-node.types'
import type { Config } from '@/v2019C1/config'
import type { DataTypes } from '@/v2019C1/extensions/data-model/query/data-types.types'
import type * as Core from '@dialecte/core'

/**
 * Reads the data model of the document once: one tree of the `DataTypeTemplates`, fed to the index
 * the import builds its own with, so both read a path alike.
 */
export async function readDataTypes(query: Core.Query<Config>): Promise<DataTypes> {
	const root = await query.getTree({ tagName: 'SCL' }, { select: { DataTypeTemplates: true } })
	const index = createDataTypeIndex()
	walkTree({
		nodes: (root?.tree ?? []) as readonly TreeNode[],
		visit({ record, ancestry }: SectionNode) {
			index.add({ record, ancestry })
		},
	})
	return index.build()
}
