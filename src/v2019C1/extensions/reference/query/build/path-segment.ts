/**
 * Strategy-based path segment extraction for SCL elements.
 *
 * Extracts path segments from SCL elements and builds canonical paths
 * from element ancestry. Uses a strategy map for element-specific extraction
 * with a default fallback for named/LNode elements.
 *
 * Separator semantics: the `separator` field indicates how THIS segment
 * joins to the PREVIOUS accumulated path (not what comes after).
 *
 * Process section paths: "S1/V1/B1/XCBR1.TripInput"
 * IED section paths:     "IED1/LD0/XCBR1.TrCmd.stVal"
 */
import { PATH_EXTRACTORS } from './path-segment.constants'

import type {
	PathSegment,
	PathSegmentContext,
	PathSegmentWithRef,
	ElementPath,
} from './path-segment.types'
import type { AnyRawRecord } from '@dialecte/core'

export { fullSignalName, logicalNodeName } from './path-extractors'

// ── Public Methods ───────────────────────────────────────────────────

/**
 * The segment one SCL element adds to a reference path (its name and the separator before it), with no query: read
 * from the record and, when given, its `context` (`siblings` to name a signal among its parent's children, the
 * LNode's `specNaming` to name an LNode by its LNodeSpecNaming); `null` for an element a path passes through
 * (AccessPoint, Server) or one with nothing to name it.
 *
 * Uses a strategy map for element-specific extraction (SourceRef, ControlRef,
 * LDevice, ExtRef, ExtCtrl).
 *
 * @intent name of an element inside a reference path, path segment of a record without a query, build a path label in a custom extension
 */
export function getPathSegment(
	record: AnyRawRecord,
	context?: PathSegmentContext,
): PathSegment | null {
	const extractor = PATH_EXTRACTORS[record.tagName]
	if (extractor) return extractor(record, context)
	return null
}

/**
 * Builds the canonical path for any SCL element from its record and ancestry.
 *
 * Expects ancestry in top-down order: [root, ..., parent].
 *
 * Process section:
 * - "S1/V1/B1/XCBR1"           (LNode under Bay)
 * - "S1/V1/B1/XCBR1.Trip"      (SourceRef under LNode)
 *
 * IED section:
 * - "IED1/LD0/XCBR1"           (LN under LDevice, AccessPoint/Server transparent)
 * - "IED1/LD0/XCBR1.TrCmd"     (ExtRef under LN)
 *
 * Returns null when no segments exist.
 */
export function buildPathFromAncestry(params: {
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
	/** The children of the record's parent, itself included: read by a signal's name. */
	siblings?: readonly AnyRawRecord[]
	/** The `LNodeSpecNaming` of each LNode of the path, by LNode id: read by an LNode's name. */
	specNamings?: ReadonlyMap<string, AnyRawRecord>
}): ElementPath | null {
	const { record, ancestry, siblings, specNamings } = params
	const parts: PathSegmentWithRef[] = []

	for (const ancestor of ancestry) {
		const seg = getPathSegment(ancestor, { specNaming: specNamings?.get(ancestor.id) })
		if (seg) parts.push({ ...seg, ref: { tagName: ancestor.tagName, id: ancestor.id } })
	}

	const ownSeg = getPathSegment(record, { siblings, specNaming: specNamings?.get(record.id) })
	if (ownSeg) parts.push({ ...ownSeg, ref: { tagName: record.tagName, id: record.id } })

	if (parts.length === 0) return null
	return { path: joinPathParts(parts), segments: parts }
}

// ── Helpers ──────────────────────────────────────────────────────────

export function joinPathParts(parts: readonly PathSegment[]): string {
	let result = parts[0].segment
	for (let i = 1; i < parts.length; i++) {
		result += parts[i].separator + parts[i].segment
	}
	return result
}
