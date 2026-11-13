import { REFERENCE_UUIDS_BY_TAG } from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'
import { readAttribute } from '@/v2019C1/helpers'

import type { LineageReader, TargetLineage, TargetLineages } from './target-lineages.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { AnyRawRecord, AnyTreeRecord } from '@dialecte/core'

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
	const named = collectNamedUuids({ nodes, referrerTags })
	if (named.uuids.size === 0) return new Map()

	// every tag read from its index at once
	const found = await Promise.all(
		[...named.tags].map((tagName) => query.any.getRecordsByTagName(tagName)),
	)
	return indexLineages({
		records: found.flat(),
		uuids: named.uuids,
		matchKey,
	})
}

/** The uuids the references of `referrerTags` among `nodes` and their descendants write, and every tag those may point at. */
function collectNamedUuids(params: {
	nodes: readonly AnyTreeRecord[]
	referrerTags: ReadonlySet<string>
}): {
	uuids: ReadonlySet<string>
	tags: ReadonlySet<string>
} {
	const uuids = new Set<string>()
	const tags = new Set<string>()
	const pending = [...params.nodes]
	while (pending.length > 0) {
		const node = pending.pop()
		if (!node) break
		pending.push(...node.tree)
		if (!params.referrerTags.has(node.tagName)) continue
		for (const reference of REFERENCE_UUIDS_BY_TAG.get(node.tagName) ?? []) {
			const uuid = readAttribute({ record: node, name: reference.uuid, defaults: 'none' })
			if (!uuid) continue
			uuids.add(uuid)
			for (const tagName of reference.target) tags.add(tagName)
		}
	}
	return { uuids, tags }
}

/** Per uuid among `uuids`, the records carrying it with their lineage. */
function indexLineages(params: {
	records: readonly AnyRawRecord[]
	uuids: ReadonlySet<string>
	matchKey: MatchKey
}): TargetLineages {
	const { records, uuids, matchKey } = params
	const lineages = new Map<string, TargetLineage[]>()
	for (const record of records) {
		const uuid = readAttribute({ record, name: 'uuid', defaults: 'none' })
		if (!uuid || !uuids.has(uuid)) continue
		const lineage = readAttribute({ record, name: matchKey, defaults: 'none' }) || undefined
		lineages.set(uuid, [...(lineages.get(uuid) ?? []), { tagName: record.tagName, lineage }])
	}
	return lineages
}
