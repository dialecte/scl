import { IED_SECTIONS_SELECT } from './read-implementation-uuids.constants'

import { IMPLEMENTATION_TARGET_TAGS } from '@/v2019C1/extensions/clean-up/transaction/orphan-lnode-bindings.constants'
import { collectWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry'
import { isNativeNode } from '@/v2019C1/extensions/reference/query/find/is-native-node'
import { readAttribute } from '@/v2019C1/helpers'

import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The uuids of what an LNode may name in the IEDs of the source: the logical nodes implementing it and the inputs and
 * outputs implementing its specified ones, the document's own (no vendor payload). The IEDs are read once.
 *
 * @internal
 */
export async function readImplementationUuids(
	query: Core.Query<Config>,
): Promise<ReadonlySet<string>> {
	const { records, ancestryOf } = await collectWithAncestry(query, { select: IED_SECTIONS_SELECT })
	return new Set(
		records.flatMap(function implementationUuid(record) {
			if (!IMPLEMENTATION_TARGET_TAGS.has(record.tagName)) return []
			if (!isNativeNode({ record, ancestry: ancestryOf(record.id) })) return []
			const uuid = readAttribute({ record, name: 'uuid', defaults: 'none' })
			return uuid ? [uuid] : []
		}),
	)
}
