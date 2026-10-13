import { getPathSegment } from '../build/path-segment'
import { parsePathSegments } from './parse-path'

import { toRawRecord } from '@dialecte/core/helpers'

import type { PathSegment } from '../build/path-segment.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Resolves a canonical SCL path to the record it points to.
 * Inverse of {@link buildElementPath}.
 *
 * Walks the tree from root, matching each path segment against children.
 * Transparent elements (AccessPoint, Server) are traversed automatically.
 *
 * @example
 * const record = await resolveElementPath(query, "S1/V1/B1/CE1")
 * // → TrackedRecord for ConductingEquipment name="CE1"
 */
export async function resolveElementPath(
	query: Core.Query<Config> | Core.Transaction<Config>,
	path: string,
): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined> {
	const segments = parsePathSegments(path)
	if (segments.length === 0) return undefined

	const root = await query.getRoot()

	return walkSegments({
		query,
		current: root as Scl.TrackedRecord<Scl.ElementsOf>,
		segments,
		index: 0,
	})
}

// ── Internal: tree walk  ─────────────────────────────────────────────────────

async function walkSegments(params: {
	query: Core.Query<Config> | Core.Transaction<Config>
	current: Scl.TrackedRecord<Scl.ElementsOf>
	segments: PathSegment[]
	index: number
}): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined> {
	const { query, current, segments, index } = params
	if (index >= segments.length) return current

	const children = current.children ?? []
	if (children.length === 0) return undefined

	const childRecords = (await query.getRecords(children)).filter((child) => child !== undefined)
	const siblings = childRecords.map(toRawRecord)

	for (const child of childRecords) {
		// A signal is named among its siblings, and one segment of it may span several pieces of
		// the parsed path (`Trip(1).general`, an input named `PTOC1.Op`).
		const seg = getPathSegment(toRawRecord(child), siblings)

		// Transparent element — look through its children
		if (!seg) {
			const result = await walkSegments({ query, current: child, segments, index })
			if (result) return result
			continue
		}

		const consumed = matchSegment({ segment: seg, segments, index })
		if (consumed > 0) {
			const result = await walkSegments({
				query,
				current: child,
				segments,
				index: index + consumed,
			})
			if (result) return result
		}
	}

	return undefined
}

/** How many parsed pieces from `index` the element's segment spells out, 0 when it does not. */
function matchSegment(params: {
	segment: PathSegment
	segments: readonly PathSegment[]
	index: number
}): number {
	const { segment, segments, index } = params
	const pieces = parsePathSegments(segment.segment)
	const spelled = segments.slice(index, index + pieces.length)
	if (pieces.length === 0 || spelled.length !== pieces.length) return 0
	if (spelled[0].separator !== segment.separator) return 0
	const matches = pieces.every(
		(piece, offset) =>
			spelled[offset].segment === piece.segment &&
			(offset === 0 || spelled[offset].separator === piece.separator),
	)
	return matches ? pieces.length : 0
}
