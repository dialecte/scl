import { readExtRefsByControlBlock } from './ext-refs-by-control-block'
import { readIedSection } from './ied-section'
import { readProcessSection } from './process-section'
import { readDataTypes } from './read-data-types'

import { createInfoContext } from '@/v2019C1/extensions/info/query/info-context'
import { resolveMappedLNodes } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-lnodes'

import type { DataflowContext } from './dataflow-context.types'
import type { IedNode, IedSection } from './ied-section.types'
import type { ProcessSection } from './process-section.types'
import type { Config } from '@/v2019C1/config'
import type { DataTypes } from '@/v2019C1/extensions/data-model/query/data-types.types'
import type { MappedLNodes } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-lnodes.types'
import type * as Core from '@dialecte/core'

/** A context whose facts are read on first use and kept for the rest of the call. */
export function createDataflowContext(query: Core.Query<Config>): DataflowContext {
	let processSection: Promise<ProcessSection> | undefined
	let iedSection: Promise<IedSection> | undefined
	let extRefsByControlBlock: Promise<ReadonlyMap<string, readonly IedNode<'ExtRef'>[]>> | undefined
	let dataTypes: Promise<DataTypes> | undefined
	let mappedProcessLNodes: Promise<MappedLNodes> | undefined

	const context: DataflowContext = {
		...createInfoContext(query),
		query,
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
		mappedProcessLNodes() {
			mappedProcessLNodes ??= readMappedProcessLNodes(context)
			return mappedProcessLNodes
		},
	}
	return context
}

async function readMappedProcessLNodes(context: DataflowContext): Promise<MappedLNodes> {
	const { lnodes } = await context.processSection()
	const refs = [...lnodes.values()].map((lnode) => lnode.ref)
	return resolveMappedLNodes(context.query, { lnodes: refs })
}
