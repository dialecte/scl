import { nativeSectionNodesOf } from './section-nodes'

import { IED_SECTION_SELECT } from '@/v2019C1/extensions/dataflow/constants/ied-section.constants'
import { IMPLEMENTATION_TARGET_TAGS } from '@/v2019C1/extensions/dataflow/constants/implementation-targets.constants'
import { collectWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry'
import { readAttribute } from '@/v2019C1/helpers'

import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The uuids of what an LNode's implementation may name in the IEDs, per tag: the logical nodes it is
 * bound or mapped to, the inputs and outputs its signals name. The document's own only (no vendor
 * payload); the IED section is read once.
 *
 * @internal
 */
export async function readImplementationTargetUuids(
	query: Core.Query<Config>,
): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
	const collected = await collectWithAncestry(query, { select: IED_SECTION_SELECT })
	const uuidsByTag = new Map<string, Set<string>>()
	for (const { record } of nativeSectionNodesOf(collected)) {
		if (!IMPLEMENTATION_TARGET_TAGS.has(record.tagName)) continue
		const uuids = uuidsByTag.get(record.tagName) ?? new Set<string>()
		const uuid = readAttribute({ record, name: 'uuid', defaults: 'none' })
		if (uuid) uuids.add(uuid)
		uuidsByTag.set(record.tagName, uuids)
	}
	return uuidsByTag
}
