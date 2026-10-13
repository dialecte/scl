import { buildPathFromAncestry, getPathSegment } from './path-segment'

import { toRawRecord } from '@dialecte/core/helpers'

import { SIGNAL_TAG_NAMES } from '@/v2019C1/extensions/reference/constants/path-extraction'

import type { ElementPath } from './path-segment.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export async function buildElementPath(
	query: Core.Query<Config>,
	ref: Scl.Ref<Scl.ElementsOf>,
): Promise<ElementPath | null> {
	const record = await query.getRecord(ref)
	if (!record) return null

	const raw = toRawRecord(record)
	// A path must address the target element itself. If the target has no path
	// segment (a transparent container, or a type with no naming rule), refuse
	// rather than return a truncated ancestry-only path that would address its
	// parent — so a caller (e.g. buildReferencePath) leaves the existing path
	// untouched instead of corrupting it.
	if (!getPathSegment(raw)) {
		const uuid = raw.attributes.find((a) => a.name === 'uuid')?.value
		console.warn(
			`[scl] buildElementPath: no path segment for <${raw.tagName}>` +
				`${uuid ? ` (uuid ${uuid})` : ''} — cannot build a path to this element; ` +
				`leaving any existing reference path untouched`,
		)
		return null
	}

	const ancestors = await query.findAncestors(ref, { order: 'top-down' })
	const siblings = SIGNAL_TAG_NAMES.has(raw.tagName) ? await readSiblings(query, raw) : undefined

	return buildPathFromAncestry({
		record: raw,
		ancestry: ancestors.map(toRawRecord),
		siblings,
	})
}

/** The children of the record's parent, the record included. */
async function readSiblings(
	query: Core.Query<Config>,
	record: Core.AnyRawRecord,
): Promise<Core.AnyRawRecord[]> {
	if (!record.parent) return [record]
	const parent = await query.getRecord(record.parent as Scl.Ref<Scl.ElementsOf>)
	if (!parent) return [record]
	const children = await query.getRecords(parent.children)
	return children.filter((child) => child !== undefined).map(toRawRecord)
}
