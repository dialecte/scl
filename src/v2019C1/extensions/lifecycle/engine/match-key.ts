import type { Config } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/** A read surface shared by the diff (Query) and reconcile (Transaction) sides. */
type Reader = Core.Query<Config> | Core.Transaction<Config>

/**
 * Index an instance subtree by its `matchKey` attribute (`templateUuid`, or `uuid` for fork), so a
 * source element's `uuid` can find its instance in O(1) by lineage. Shared verbatim by the diff
 * (report) and reconcile (apply) sides so both derive the same key → element map.
 */
export async function indexByMatchKey(
	reader: Reader,
	params: { node: AnyTreeRecord; index: Map<string, AnyTreeRecord>; matchKey: MatchKey },
): Promise<void> {
	const { node, index, matchKey } = params
	const key = await reader.any.getAttribute(node, { name: matchKey })
	if (key) index.set(key, node)
	for (const child of node.tree) await indexByMatchKey(reader, { node: child, index, matchKey })
}

/**
 * Collect every `uuid` in a source subtree — the set of template lineages that still exist, used to
 * decide which instance elements were removed from the template. Shared by both engine sides.
 */
export async function collectUuids(
	reader: Reader,
	params: { node: AnyTreeRecord; out: Set<string> },
): Promise<void> {
	const { node, out } = params
	const uuid = await reader.any.getAttribute(node, { name: 'uuid' })
	if (uuid) out.add(uuid)
	for (const child of node.tree) await collectUuids(reader, { node: child, out })
}
