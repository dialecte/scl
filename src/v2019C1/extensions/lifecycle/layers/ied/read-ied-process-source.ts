import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { readProcessSection } from '@/v2019C1/extensions/dataflow/query/process-section'
import { readSatelliteIndex } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites'
import { isNativeRecord } from '@/v2019C1/extensions/reference/query/find/is-native-record'
import { resolveMappedLNodes } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-lnodes'
import { readAttribute } from '@/v2019C1/helpers'

import type { IedProcessSource } from './ied-process.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TagCollectingQuery } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry.types'
import type * as Core from '@dialecte/core'

/**
 * Everything the process part of an IED export is planned from, read once whatever the size of the section: the process
 * section (the document's own content), what implements each of its LNodes, the variables and behaviour descriptions
 * with their references, and the elements of the IED (their uuid, their parent).
 */
export async function readIedProcessSource(
	query: Core.Query<Config>,
	params: { iedRef: Scl.Ref<'IED'> },
): Promise<IedProcessSource> {
	const section = await readProcessSection(query)
	const lnodes = [...section.lnodes.values()].map(function refOf(lnode) {
		return lnode.ref
	})
	const mapped = await resolveMappedLNodes(query, { lnodes })
	const satellites = await readSatelliteIndex(query)
	const collected = await (query as unknown as TagCollectingQuery).findDescendants(params.iedRef, {
		collect: SCL_DIALECTE_CONFIG.descendants.IED,
	})
	const iedElements = Object.values(collected)
		.flat()
		.filter(isNativeRecord)
		.map(function asElement(record) {
			const uuid = readAttribute({ record, name: 'uuid', defaults: 'none' })
			return { id: record.id, parent: record.parent?.id, uuid }
		})
	return { section, mapped, satellites, iedElements }
}
