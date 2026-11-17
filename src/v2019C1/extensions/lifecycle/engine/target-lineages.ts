import {
	findNamedRecords,
	uuidsNamedBy,
} from '@/v2019C1/extensions/reference/query/find/named-targets'
import { readAttribute } from '@/v2019C1/helpers'

import type { LineageReader, TargetLineage, TargetLineages } from './target-lineages.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { NamedTarget } from '@/v2019C1/extensions/reference/query/find/named-targets.types'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * The lineage of every element the references held in `nodes` name by a uuid (see `TargetLineages`), read in one pass
 * over the project: the uuids and the tags they may point at come from the held records of the tags whose identity the
 * caller reads (`referrerTags`), then the elements of those target tags are read once. Under the `uuid` key the lineage
 * of an element is its uuid: the map then says which uuids an element of the project carries.
 */
export async function readTargetLineages(
	query: LineageReader,
	params: {
		nodes: readonly AnyTreeRecord[]
		matchKey: MatchKey
		/** The referrer tags whose reference identity the caller reads: only their uuids are looked up. */
		referrerTags: ReadonlySet<string>
	},
): Promise<TargetLineages> {
	const { nodes, matchKey, referrerTags } = params
	const named = collectNamed({ nodes, referrerTags })
	const records = await findNamedRecords(query, { named })
	return new Map(
		[...records].map(([uuid, carriers]) => [
			uuid,
			carriers.map((record) => ({
				tagName: record.tagName,
				lineage: readAttribute({ record, name: matchKey, defaults: 'none' }) || undefined,
			})),
		]),
	)
}

/** What the references of `referrerTags` among `nodes` and their descendants name, by either registry. */
function collectNamed(params: {
	nodes: readonly AnyTreeRecord[]
	referrerTags: ReadonlySet<string>
}): NamedTarget[] {
	const named: NamedTarget[] = []
	const pending = [...params.nodes]
	while (pending.length > 0) {
		const node = pending.pop()
		if (!node) break
		pending.push(...node.tree)
		if (params.referrerTags.has(node.tagName)) named.push(...uuidsNamedBy(node))
	}
	return named
}
