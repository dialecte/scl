import { readExtRefsByControlBlock } from './ext-refs-by-control-block'
import { readIedSection } from './ied-section'
import { readProcessSection } from './process-section'
import { readDataTypes } from './read-data-types'

import { createInfoContext } from '@/v2019C1/extensions/info/query/info-context'

import type { DataflowContext } from './dataflow-context.types'
import type { IedNode, IedSection } from './ied-section.types'
import type { ProcessSection } from './process-section.types'
import type { Config } from '@/v2019C1/config'
import type { DataTypes } from '@/v2019C1/extensions/data-model/query/data-types.types'
import type * as Core from '@dialecte/core'

/** A context whose facts are read on first use and kept for the rest of the call. */
export function createDataflowContext(query: Core.Query<Config>): DataflowContext {
	let processSection: Promise<ProcessSection> | undefined
	let iedSection: Promise<IedSection> | undefined
	let extRefsByControlBlock: Promise<ReadonlyMap<string, readonly IedNode<'ExtRef'>[]>> | undefined
	let dataTypes: Promise<DataTypes> | undefined

	const context: DataflowContext = {
		...createInfoContext(query),
		processSection() {
			processSection ??= readProcessSection(query)
			return processSection
		},
		iedSection() {
			iedSection ??= readIedSection(query)
			return iedSection
		},
		extRefsByControlBlock() {
			extRefsByControlBlock ??= readExtRefsByControlBlock({ context })
			return extRefsByControlBlock
		},
		dataTypes() {
			dataTypes ??= readDataTypes(query)
			return dataTypes
		},
	}
	return context
}
