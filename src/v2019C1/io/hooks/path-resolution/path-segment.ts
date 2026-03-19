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

import { AnyRawRecord } from '@dialecte/core'

import type { PathSegment, PathExtractor } from './types'

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
export function buildElementPath(params: {
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
}): string | null {
	const { record, ancestry } = params
	const parts: PathSegment[] = []

	for (const ancestor of ancestry) {
		const seg = getPathSegment(ancestor)
		if (seg) parts.push(seg)
	}

	const ownSeg = getPathSegment(record)
	if (ownSeg) parts.push(ownSeg)

	if (parts.length === 0) return null
	return joinPathParts(parts)
}

// ── Extractor factories ───────────────────────────────────────────────

/** Element does not contribute a segment (transparent container). */
function transparent(): PathExtractor {
	return () => null
}

/** Use the `name` attribute as the path segment. */
function byName(separator: '/' | '.' = '/'): PathExtractor {
	return (record) => {
		const name = getAttribute(record, 'name')
		return name ? { segment: name, separator } : null
	}
}

/** Use the lnClass composite (prefix + lnClass + inst) as the path segment. */
function byLnClass(): PathExtractor {
	return (record) => {
		const lnClass = getAttribute(record, 'lnClass')
		if (!lnClass) return null
		const prefix = getAttribute(record, 'prefix') ?? ''
		const inst = getAttribute(record, 'inst') ?? getAttribute(record, 'lnInst') ?? ''
		return { segment: `${prefix}${lnClass}${inst}`, separator: '/' }
	}
}

/** Use a specific attribute as the path segment. */
function byAttribute(attr: string, separator: '/' | '.'): PathExtractor {
	return (record) => {
		const val = getAttribute(record, attr)
		return val ? { segment: val, separator } : null
	}
}

/**
 * Strategy map for element-specific path extraction.
 *
 * Covers all elements that appear as path segment contributors or as UUID
 * reference targets in UUID_REFERENCE_PAIRS.
 */
const PATH_EXTRACTORS: Record<string, PathExtractor> = {
	// Transparent — do not contribute a path segment
	AccessPoint: transparent(),
	Server: transparent(),

	// IED section — structural containers
	LDevice: byAttribute('inst', '/'),
	IED: byName(),

	// IED section — logical nodes (targets of lnode resolution)
	LN: byLnClass(),
	LN0: byLnClass(),

	// IED section — data references
	ExtRef: byAttribute('intAddr', '.'),
	ExtCtrl: byAttribute('intAddr', '.'),

	// Process section — named path contributors (targets of lnode / ied-address resolution)
	SourceRef: byAttribute('input', '.'),
	ControlRef: byAttribute('output', '.'),

	// Process section — targets of direct UUID resolution
	Substation: byName(),
	VoltageLevel: byName(),
	Bay: byName(),
	ConductingEquipment: byName(),
	PowerTransformer: byName(),
	TransformerWinding: byName(),
	GeneralEquipment: byName(),
	SubEquipment: byName(),
	LNode: byLnClass(),
	Function: byName(),
	SubFunction: byName(),
	EqFunction: byName(),
	EqSubFunction: byName(),
	AllocationRole: byName(),
	BehaviorDescription: byName(),
	FunctionCategory: byName(),
	SubCategory: byName(),
	FunctionalVariant: byName(),
	FunctionalSubVariant: byName(),
	ProcessResource: byName(),
	Variable: byName(),
	Process: byName(),
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
