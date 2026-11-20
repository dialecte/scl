import { describeRecords } from './describe-records'
import { createInfoContext } from './info-context'

import { isTransparentElement } from '@/v2019C1/helpers/transparent-elements'

import type { SearchHit, SearchParams } from './search.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The elements of the tags given whose title holds the term, each with the ids of its ancestors from the root down,
 * so a tree that has not loaded an element can open the path to it. The titles are the ones `ofEach` gives (in the
 * `mode` asked, `compact` by default), so a hit reads in a tree as the text searched. The term is trimmed and matched
 * case aside, anywhere in the title; an empty term finds nothing and reads nothing. The ancestors leave out the
 * element itself and the transparent elements (`Private`), as a tree read unwrapping them shows none. An element of an
 * omitted tag, or below one, is no hit. Inside a transaction the staged state is searched.
 *
 * The hits come in the order of the tags given, then in the store's order within a tag; `limit` keeps the first ones
 * (a limit of 0 or less finds nothing and reads nothing). A transparent element (`Private`) given among the tags is
 * searched too, though a tree read unwrapping it shows no row for it.
 *
 * Perf: one `getRecordsByTagName` per tag, the titles of all of them in one batch (as `ofEach`: at most 3 reads for
 * the signals, one per child tag a title reads), then one `findAncestorsOfEach` over the hits (one read per ancestor
 * level, none without a hit): a fixed number of reads whatever the number of hits; no read for an empty term.
 *
 * @intent find elements by the title a tree shows, search a tree that loads lazily, reveal a search hit by its ancestor ids
 */
export async function search(
	query: Core.Query<Config>,
	params: SearchParams,
): Promise<SearchHit[]> {
	const { term, mode = 'compact', omit = [], limit } = params
	const needle = term.trim().toLocaleLowerCase()
	if (needle === '' || (limit !== undefined && limit <= 0)) return []
	const omitted = new Set<string>(omit)
	const tagNames = [...new Set(params.tagNames)].filter((tagName) => !omitted.has(tagName))

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

	const ancestorsOfEach = await query.findAncestorsOfEach(
		matched.map(({ record }) => record as Scl.TrackedRecord<Scl.ElementsOf>),
		{ order: 'top-down' },
	)
	const hits: SearchHit[] = []
	for (let index = 0; index < matched.length; index++) {
		if (limit !== undefined && hits.length >= limit) break
		const ancestors = ancestorsOfEach[index]
		if (ancestors.some((ancestor) => omitted.has(ancestor.tagName))) continue
		const { record, title } = matched[index]
		hits.push({
			tagName: record.tagName,
			id: record.id,
			title,
			ancestorIds: ancestors.flatMap((ancestor) =>
				isTransparentElement(ancestor.tagName) ? [] : [ancestor.id],
			),
		})
	}
	return hits
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
