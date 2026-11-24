import { describeRecords } from './describe-records'
import { createInfoContext } from './info-context'

import { isTransparentElement } from '@/v2019C1/helpers/transparent-elements'

import type { SearchHit, SearchParams } from './search.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The elements of the tags given whose title holds the term, each with its ancestors from the root down (as ids and
 * as refs), so a tree that has not loaded an element can open the path to it. The titles are the ones `ofEach` gives (in the
 * `mode` asked, `compact` by default), so a hit reads in a tree as the text searched. The term is trimmed and matched
 * case aside, anywhere in the title; an empty term finds nothing and reads nothing. The ancestors leave out the
 * element itself and the transparent elements (`Private`), as a tree read unwrapping them shows none. An element of an
 * omitted tag, or below one, is no hit. Inside a transaction the staged state is searched.
 *
 * The hits come in the order of the tags given, then in the store's order within a tag; `limit` keeps the first ones
 * (its whole part; a limit of 0 or less finds nothing and reads nothing, one that is not a finite number is no cap).
 * With nothing omitted, only the hits kept have their ancestors read. A transparent element (`Private`) given among
 * the tags is searched too, though a tree read unwrapping it shows no row for it.
 *
 * Perf: one `getRecordsByTagName` per tag, the titles of all of them in one batch (as `ofEach`: at most 3 reads for
 * the signals, one per child tag a title reads), then one `findAncestorsOfEach` over the hits (one read per ancestor
 * level, none without a hit): a fixed number of reads whatever the number of hits; no read for an empty term, a limit
 * of 0 or every tag omitted.
 *
 * @intent find elements by the title a tree shows, search a tree that loads lazily, reveal a search hit by its ancestor ids
 */
export async function search(
	query: Core.Query<Config>,
	params: SearchParams,
): Promise<SearchHit[]> {
	const { term, mode = 'compact', omit = [] } = params
	const needle = term.trim().toLocaleLowerCase()
	const cap = capOf({ limit: params.limit })
	if (needle === '' || cap === 0) return []
	const omitted = new Set<string>(omit)
	const tagNames = [...new Set(params.tagNames)].filter((tagName) => !omitted.has(tagName))
	if (tagNames.length === 0) return []

	const candidates = await readCandidates({ query, tagNames })
	const infos = await describeRecords({
		query,
		records: candidates,
		options: { mode },
		context: createInfoContext(query),
	})
	const matched: { record: Core.AnyTrackedRecord; title: string }[] = []
	for (let index = 0; index < candidates.length; index++) {
		const title = infos[index].title
		if (title.toLocaleLowerCase().includes(needle))
			matched.push({ record: candidates[index], title })
	}
	if (matched.length === 0) return []

	// with nothing omitted every match is a hit, so only the first `cap` need their ancestors; else all are read to
	// leave out the matches below an omitted tag
	const placed = omitted.size === 0 && cap !== undefined ? matched.slice(0, cap) : matched
	const ancestorsOfEach = await query.findAncestorsOfEach(
		placed.map(({ record }) => record as Scl.TrackedRecord<Scl.ElementsOf>),
		// an omitted Private leaves out the hits below it: the chain keeps it
		{ order: 'top-down', unwrap: [] },
	)
	const hits: SearchHit[] = []
	for (let index = 0; index < placed.length; index++) {
		if (cap !== undefined && hits.length >= cap) break
		const ancestors = ancestorsOfEach[index]
		if (ancestors.some((ancestor) => omitted.has(ancestor.tagName))) continue
		const { record, title } = placed[index]
		const path = ancestors.flatMap((ancestor) =>
			isTransparentElement(ancestor.tagName)
				? []
				: [{ tagName: ancestor.tagName, id: ancestor.id }],
		)
		hits.push({
			tagName: record.tagName,
			id: record.id,
			title,
			ancestorIds: path.map((ancestor) => ancestor.id),
			ancestors: path,
		})
	}
	return hits
}

/**
 * The number of hits a `limit` keeps: its whole part, 0 at most for 0 or less, `undefined` (no cap) when absent or not
 * a finite number.
 */
function capOf(params: { limit: number | undefined }): number | undefined {
	const { limit } = params
	if (limit === undefined || !Number.isFinite(limit)) return undefined
	return Math.max(0, Math.floor(limit))
}

/** Every element of the tags given, tag after tag, one read per tag. */
async function readCandidates(params: {
	query: Core.Query<Config>
	tagNames: readonly Scl.ElementsOf[]
}): Promise<Core.AnyTrackedRecord[]> {
	const { query, tagNames } = params
	const candidates: Core.AnyTrackedRecord[] = []
	for (const tagName of tagNames) {
		// dialecte-allow query-in-loop: one read per tag given, whatever the number of elements: the store reads one tag per call
		const ofTag = await query.getRecordsByTagName(tagName)
		candidates.push(...ofTag)
	}
	return candidates
}
