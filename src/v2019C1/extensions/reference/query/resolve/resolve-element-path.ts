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

	const childRecords = await query.getRecords(children)
	const target = segments[index]

	for (const child of childRecords) {
		if (!child) continue

		const seg = getPathSegment(toRawRecord(child))

		// Transparent element — look through its children
		if (!seg) {
			const result = await walkSegments({ query, current: child, segments, index })
			if (result) return result
			continue
		}

		if (seg.segment === target.segment && seg.separator === target.separator) {
			const result = await walkSegments({ query, current: child, segments, index: index + 1 })
			if (result) return result
			continue
		}
	}

	return undefined
}
