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

import { PATH_EXTRACTION_CONFIG } from '@/v2019C1/extensions/reference/constants/path-extraction'

import type {
	PathSegment,
	PathSegmentWithRef,
	ElementPath,
	PathExtractor,
} from './path-segment.types'
import type { ExtractionStrategy } from '@/v2019C1/extensions/reference/constants/path-extraction'
import type { AnyRawRecord } from '@dialecte/core'

// ── Extractor builders ───────────────────────────────────────────────

function buildExtractor(strategy: ExtractionStrategy): PathExtractor {
	switch (strategy.type) {
		case 'transparent':
			return () => null
		case 'name': {
			const separator = strategy.separator ?? '/'
			return (record) => {
				const name = getAttribute(record, 'name')
				return name ? { segment: name, separator } : null
			}
		}
		case 'lnClass':
			return (record) => {
				const lnClass = getAttribute(record, 'lnClass')
				if (!lnClass) return null
				const prefix = getAttribute(record, 'prefix') ?? ''
				const inst = getAttribute(record, 'inst') ?? getAttribute(record, 'lnInst') ?? ''
				return { segment: `${prefix}${lnClass}${inst}`, separator: '/' }
			}
		case 'attribute':
			return (record) => {
				const val = getAttribute(record, strategy.attr)
				return val ? { segment: val, separator: strategy.separator } : null
			}
		case 'sourceRef':
			return (record) => {
				const input = getAttribute(record, 'input')
				if (!input) return null
				let segment = input
				const inputInst = getAttribute(record, 'inputInst')
				if (inputInst && inputInst !== '1') segment += `(${inputInst})`
				const pDA = getAttribute(record, 'pDA')
				if (pDA) segment += `.${pDA}`
				return { segment, separator: '.' }
			}
		case 'controlRef':
			return (record) => {
				const output = getAttribute(record, 'output')
				if (!output) return null
				let segment = output
				const outputInst = getAttribute(record, 'outputInst')
				if (outputInst && outputInst !== '1') segment += `(${outputInst})`
				return { segment, separator: '.' }
			}
	}
}

const PATH_EXTRACTORS: Record<string, PathExtractor> = Object.fromEntries(
	Object.entries(PATH_EXTRACTION_CONFIG).map(([tag, strategy]) => [tag, buildExtractor(strategy)]),
)

// ── Public Methods ───────────────────────────────────────────────────

/**
 * Returns the path segment for an SCL element.
 *
 * Uses a strategy map for element-specific extraction (SourceRef, ControlRef,
 * LDevice, ExtRef, ExtCtrl).
 * Returns null for transparent containers (AccessPoint, Server) and
 * elements without identifiable attributes.
 */
export function getPathSegment(record: AnyRawRecord): PathSegment | null {
	const extractor = PATH_EXTRACTORS[record.tagName]
	if (extractor) return extractor(record)
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
}): ElementPath | null {
	const { record, ancestry } = params
	const parts: PathSegmentWithRef[] = []

	for (const ancestor of ancestry) {
		const seg = getPathSegment(ancestor)
		if (seg) parts.push({ ...seg, ref: { tagName: ancestor.tagName, id: ancestor.id } })
	}

	const ownSeg = getPathSegment(record)
	if (ownSeg) parts.push({ ...ownSeg, ref: { tagName: record.tagName, id: record.id } })

	if (parts.length === 0) return null
	return { path: joinPathParts(parts), segments: parts }
}

// ── Helpers ──────────────────────────────────────────────────────────

function getAttribute(record: AnyRawRecord, name: string): string | undefined {
	return record.attributes.find((attribute) => attribute.name === name)?.value
}

export function joinPathParts(parts: readonly PathSegment[]): string {
	let result = parts[0].segment
	for (let i = 1; i < parts.length; i++) {
		result += parts[i].separator + parts[i].segment
	}
	return result
}
