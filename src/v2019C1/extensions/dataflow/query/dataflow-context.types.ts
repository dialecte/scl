import type { IedNode, IedSection } from './ied-section.types'
import type { ProcessSection } from './process-section.types'
import type { Config } from '@/v2019C1/config'
import type { DataTypes } from '@/v2019C1/extensions/data-model/query/data-types.types'
import type { InfoContext } from '@/v2019C1/extensions/info/query/info-context.types'
import type * as Core from '@dialecte/core'

/**
 * Document-wide facts a dataflow query reads, each on first use and kept for the rest of the call:
 * the facts of the info context, then one read of the process section and one of the IED section,
 * the ExtRefs of each control block, and the data model of the document. The `query` is the one the
 * call reads through: the records the sections hold are read with it, with no store round trip.
 */
export type DataflowContext = InfoContext & {
	query: Core.Query<Config>
	processSection: () => Promise<ProcessSection>
	iedSection: () => Promise<IedSection>
	/** The ExtRefs naming each control block, by control block id, in document order. */
	extRefsByControlBlock: () => Promise<ReadonlyMap<string, readonly IedNode<'ExtRef'>[]>>
	/** The logical node types, data object types and data attribute types of the document. */
	dataTypes: () => Promise<DataTypes>
}
