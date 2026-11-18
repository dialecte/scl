import { buildPathFromAncestry, getPathSegment } from './path-segment'
import { readSiblingsOfEach } from './read-siblings-of-each'
import { readSpecNamingsById } from './spec-namings'

import { toRawRecord } from '@dialecte/core/helpers'

import { SIGNAL_TAG_NAMES } from '@/v2019C1/extensions/reference/constants/path-extraction'

import type { BuildElementPathsParams, BuildElementPathsResult } from './build-element-path.types'
import type { ElementPath } from './path-segment.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The path of an element from the document root, as reference paths write it (`S1/V1/B1/CE1`,
 * `IED1/LD0/XCBR1.Pos`), with the element each segment names. `null` when the element has no
 * segment of its own (a transparent container such as `AccessPoint`).
 *
 * Perf: `buildElementPaths` of the element alone.
 *
 * @intent path or label of an element from the root like Substation/VoltageLevel/Bay, breadcrumb path of a Bay/LNode/DO, full name path instead of walking ancestors, inverse of resolveElementPath
 */
export async function buildElementPath(
	query: Core.Query<Config>,
	ref: Scl.Ref<Scl.ElementsOf>,
): Promise<ElementPath | null> {
	const [path] = await buildElementPaths(query, { refs: [ref] })
	return path
}

/**
 * The path of each element given from the document root, as `buildElementPath` answers it, one entry per input in
 * input order: `null` for a ref that names no element and for an element with no segment of its own (the root, a
 * transparent container such as `AccessPoint`, a type). An element given several times answers the same path at each
 * position. A record given is read again, so the path is of the element as the query sees it (inside a transaction,
 * as staged).
 *
 * Perf: the elements in one read, their ancestors by `findAncestorsOfEach` (one read per ancestor level, an ancestor
 * shared by several elements read once), the siblings of the signals among them in at most 3 reads, the spec namings
 * of the LNodes on their paths in at most 2: the reads follow the depth of the tree, not the number of elements.
 *
 * @intent paths or labels of many elements at once, breadcrumb of every row of a list, element paths without one ancestor walk per element, batch buildElementPath
 *
 * @throws {@link DialecteError} `ELEMENT_TAGNAME_MISMATCH` when a ref names an element of another tag: the whole call
 * is refused, no path answered (a staged or cached ref is checked before the refs read from the store, then input
 * order).
 */
export async function buildElementPaths(
	query: Core.Query<Config>,
	params: BuildElementPathsParams,
): Promise<BuildElementPathsResult> {
	const read = await query.getRecords([...params.refs])
	// A path must address the target element itself. A target with no path segment (a transparent
	// container, or a type with no naming rule) answers null rather than a truncated ancestry-only
	// path that would address its parent, so a caller (e.g. buildReferencePath) leaves the existing
	// path untouched instead of corrupting it.
	const targets = read.flatMap(function withSegment(record, position) {
		return record && getPathSegment(toRawRecord(record)) ? [{ position, record }] : []
	})
	if (targets.length === 0) return read.map(() => null)

	const ancestriesOfEach = await query.findAncestorsOfEach(
		targets.map((target) => target.record),
		{ order: 'top-down' },
	)
	const raws = targets.map((target) => toRawRecord(target.record))
	const ancestries = ancestriesOfEach.map((ancestors) => ancestors.map(toRawRecord))
	const signals = raws.filter((raw) => SIGNAL_TAG_NAMES.has(raw.tagName))
	const siblingsOfEach = await readSiblingsOfEach({ query, records: signals })
	const siblingsById = new Map(signals.map((signal, index) => [signal.id, siblingsOfEach[index]]))
	const specNamings = await readSpecNamingsById(query, {
		records: distinctById([...ancestries.flat(), ...raws]),
	})

	// each position its own path; a position without a target (no element, no segment) answers null
	const paths: BuildElementPathsResult = read.map(() => null)
	for (const [index, target] of targets.entries()) {
		paths[target.position] = buildPathFromAncestry({
			record: raws[index],
			ancestry: ancestries[index],
			siblings: siblingsById.get(raws[index].id),
			specNamings,
		})
	}
	return paths
}

/** The records, each id once, in first-seen order. */
function distinctById<GenericRecord extends { id: string }>(
	records: readonly GenericRecord[],
): GenericRecord[] {
	return [...new Map(records.map((record) => [record.id, record])).values()]
}
