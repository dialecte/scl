import { getPathSegment, joinPathParts } from '../build/path-segment'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'

import type { PathSegment } from '../build/path-segment.types'
import type { ResolutionType, ParsedReference } from './types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * Returns the resolution type for a (elementTag, pathAttribute) pair.
 * Returns null if the pair is not recognized.
 */
export function getResolutionType(
	elementTag: string,
	pathAttribute: string,
): ResolutionType | null {
	const pairs = UUID_REFERENCE_PAIRS[elementTag as keyof typeof UUID_REFERENCE_PAIRS]
	return pairs?.find((pair) => pair.attribute.path === pathAttribute)?.resolution ?? null
}

// ── Path segment parsing ─────────────────────────────────────────────

/**
 * Parses a canonical SCL path string back into ordered path segments.
 * Inverse of {@link joinPathParts}.
 *
 * @example
 * parsePathSegments("S1/V1/B1/XCBR1")
 * // → [{segment:"S1", separator:"/"}, {segment:"V1", separator:"/"}, ...]
 *
 * parsePathSegments("S1/B1/XCBR1.Trip")
 * // → [..., {segment:"XCBR1", separator:"/"}, {segment:"Trip", separator:"."}]
 */
export function parsePathSegments(path: string): PathSegment[] {
	if (!path) return []

	const segments: PathSegment[] = []
	let current = ''
	let separator: '/' | '.' = '/'

	for (const char of path) {
		if (char === '/' || char === '.') {
			if (current) segments.push({ segment: current, separator })
			separator = char as '/' | '.'
			current = ''
		} else {
			current += char
		}
	}

	if (current) segments.push({ segment: current, separator })

	return segments
}

// ── LNode qualifier splitting ────────────────────────────────────────

/**
 * Splits an LNode-style path into structural path and optional DO/DA qualifier.
 *
 * The first "." in the last "/" segment marks the boundary between the
 * LNode identity and the data-object chain. The qualifier portion is not
 * a navigable record — it represents DO/SDO/DA/BDA names.
 *
 * @example
 * splitLnodeQualifier("S1/B1/XCBR1.Pos.stVal")
 * // → { path: "S1/B1/XCBR1", qualifier: "Pos.stVal" }
 *
 * splitLnodeQualifier("S1/B1/XCBR1")
 * // → { path: "S1/B1/XCBR1" }
 */
export function splitLnodeQualifier(pathValue: string): {
	path: string
	qualifier?: string
} {
	const segments = pathValue.split('/')
	const lastSegment = segments[segments.length - 1]
	const dotIndex = lastSegment.indexOf('.')

	if (dotIndex === -1) return { path: pathValue }

	const lnSegment = lastSegment.substring(0, dotIndex)
	const qualifier = lastSegment.substring(dotIndex + 1)
	const structuralPath = [...segments.slice(0, -1), lnSegment].join('/')

	return { path: structuralPath, qualifier: qualifier || undefined }
}

// ── Strategy-based reference path parsing ────────────────────────────

/**
 * Parses a reference path value using the given resolution strategy.
 *
 * Pure function — takes the already-determined strategy and raw inputs,
 * returns the lookup key(s) for path→UUID index matching.
 *
 * Used by IO hooks (import-time) and can be used by query-time resolution.
 */
export function parseReferencePath(
	resolution: ResolutionType,
	pathAttribute: string,
	pathValue: string,
	ancestry?: readonly AnyRawRecord[],
): ParsedReference | null {
	if (!resolution || resolution === 'unsupported') return null

	if (resolution === 'direct') return { lookupKey: pathValue }

	if (resolution === 'ied-address') return parseIedAddressPath(pathValue, ancestry)

	if (resolution === 'lnode') return parseLnodePath(pathValue)

	if (resolution === 'behavior-description') {
		return parseBehaviorDescriptionPath(pathAttribute, pathValue, ancestry)
	}

	return null
}

// ── lnode strategy ───────────────────────────────────────────────────

/**
 * Parses a path value using the `lnode` resolution strategy.
 *
 * Strips the DO/DA qualifier from the last segment to produce the lookup key.
 *
 * @example
 * parseLnodePath("S1/V1/B1/PXCBR1.Pos.stVal")
 * // → { lookupKey: "S1/V1/B1/PXCBR1", qualifier: "Pos.stVal" }
 *
 * parseLnodePath("S1/V1/B1/XCBR1")
 * // → { lookupKey: "S1/V1/B1/XCBR1" }
 */
export function parseLnodePath(pathValue: string): ParsedReference {
	const { path, qualifier } = splitLnodeQualifier(pathValue)
	return { lookupKey: path, qualifier }
}

// ── ied-address strategy ─────────────────────────────────────────────

function parseIedAddressPath(
	pathValue: string,
	ancestry?: readonly AnyRawRecord[],
): ParsedReference {
	if (ancestry) {
		const iedName = findIedNameFromAncestry(ancestry)
		if (iedName) {
			return { lookupKey: pathValue, fallbackLookupKey: `${iedName}/${pathValue}` }
		}
	}
	return { lookupKey: pathValue }
}

// ── behavior-description strategy ────────────────────────────────────

function parseBehaviorDescriptionPath(
	pathAttrName: string,
	pathValue: string,
	ancestry?: readonly AnyRawRecord[] | null,
): ParsedReference | null {
	if (!ancestry) return null

	const contextPath = findScopeContextPath(ancestry)
	if (!contextPath) return null

	if (pathAttrName === 'dataName') {
		return { lookupKey: contextPath, qualifier: pathValue }
	}

	if (pathAttrName === 'inputName' || pathAttrName === 'outputName') {
		const cleanName = stripDisambiguation(pathValue)
		return { lookupKey: `${contextPath}.${cleanName}` }
	}

	return null
}

// ── Shared helpers ───────────────────────────────────────────────────

/**
 * Walks ancestry backwards to build the path from ancestors above the
 * nearest BehaviorDescription.
 */
function findScopeContextPath(ancestry: readonly AnyRawRecord[]): string | null {
	let behaviorDescriptionIndex = -1
	for (let i = ancestry.length - 1; i >= 0; i--) {
		if (ancestry[i].tagName === 'BehaviorDescription') {
			behaviorDescriptionIndex = i
			break
		}
	}

	if (behaviorDescriptionIndex === -1) return null

	const parts: Array<{ segment: string; separator: '/' | '.' }> = []

	for (let i = 0; i < behaviorDescriptionIndex; i++) {
		const seg = getPathSegment(ancestry[i])
		if (seg) parts.push(seg)
	}

	if (parts.length === 0) return null
	return joinPathParts(parts)
}

/**
 * Strips disambiguation suffix and qualifier from an input/output name.
 *
 * Per IEC TR 61850-90-30:
 * - Instance suffix: "Trip(2)" → "Trip"
 * - Qualifier suffix: "Trip.pDA" → "Trip"
 * - Both: "Trip(2).pDA" → "Trip"
 */
export function stripDisambiguation(value: string): string {
	const parenIndex = value.indexOf('(')
	const dotIndex = value.indexOf('.')

	if (parenIndex !== -1) return value.substring(0, parenIndex)
	if (dotIndex !== -1) return value.substring(0, dotIndex)
	return value
}

/**
 * Finds the iedName attribute from the nearest LNode ancestor.
 */
export function findIedNameFromAncestry(ancestry: readonly AnyRawRecord[]): string | null {
	for (let i = ancestry.length - 1; i >= 0; i--) {
		if (ancestry[i].tagName === 'LNode') {
			return ancestry[i].attributes.find((a) => a.name === 'iedName')?.value ?? null
		}
	}
	return null
}
