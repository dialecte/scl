import { getPathSegment, joinPathParts } from '../build/path-segment'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference'

import type { PathSegment } from '../build/path-segment.types'
import type { ParsedReference } from './types'
import type { ResolutionType } from '@/v2019C1/extensions/reference'
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
export function parseReferencePath(params: {
	resolution: ResolutionType
	pathAttribute: string
	pathValue: string
	/** The referrer's ancestors, top-down: read by the strategies whose names are local. */
	ancestry?: readonly AnyRawRecord[]
	/** The `LNodeSpecNaming` of each LNode of `ancestry`, by LNode id: names those LNodes. */
	specNamings?: ReadonlyMap<string, AnyRawRecord>
	/**
	 * For a function-scoped pair (a signal role's reference): the path of the Function its path
	 * starts below. The path is read relative to it, and as written, the absolute form an earlier
	 * version wrote.
	 */
	functionBase?: string
}): ParsedReference | null {
	const { resolution, pathAttribute, pathValue, ancestry, specNamings, functionBase } = params
	if (!resolution || resolution === RESOLUTION_TYPE.unsupported) return null

	if (functionBase !== undefined)
		return parseFunctionScopedPath({ resolution, pathValue, functionBase })

	if (resolution === RESOLUTION_TYPE.direct) return { lookupKey: pathValue }

	if (resolution === RESOLUTION_TYPE.iedAddress) return parseIedAddressPath(pathValue, ancestry)

	if (resolution === RESOLUTION_TYPE.lnode) return parseLnodePath(pathValue)

	if (resolution === RESOLUTION_TYPE.behaviorDescription) {
		return parseBehaviorDescriptionPath({ pathAttribute, pathValue, ancestry, specNamings })
	}

	if (resolution === RESOLUTION_TYPE.ancestorName) {
		return parseAncestorNamePath({ pathValue, ancestry, specNamings })
	}

	return null
}

// ── function-scoped paths ────────────────────────────────────────────

/**
 * A path from a Function down, the Function left out, every level joined with "/": the absolute
 * key puts the Function's path in front, and joins a signal to its LNode with "." (`SF1/PTRC1/Trip`
 * below `S1/F1` is `S1/F1/SF1/PTRC1.Trip`); a data path keeps its qualifier.
 */
function parseFunctionScopedPath(params: {
	resolution: ResolutionType
	pathValue: string
	functionBase: string
}): ParsedReference | null {
	const { resolution, pathValue, functionBase } = params
	if (resolution === RESOLUTION_TYPE.lnode) {
		const relative = parseLnodePath(`${functionBase}/${pathValue}`)
		const asWritten = parseLnodePath(pathValue)
		return { ...relative, fallbackLookupKeys: [asWritten.lookupKey] }
	}
	if (resolution !== RESOLUTION_TYPE.direct) return null
	const lastSlash = pathValue.lastIndexOf('/')
	const signalPath =
		lastSlash === -1
			? pathValue
			: `${pathValue.slice(0, lastSlash)}.${pathValue.slice(lastSlash + 1)}`
	return { lookupKey: `${functionBase}/${signalPath}`, fallbackLookupKeys: [pathValue] }
}

// ── ancestor-name strategy ───────────────────────────────────────────

/**
 * A bare name looked up in the referrer's ancestors, nearest first: one key per ancestor, the
 * name below that ancestor's path. A value holding a "/" is the full path an earlier version
 * wrote: it is tried first, as is.
 */
function parseAncestorNamePath(params: {
	pathValue: string
	ancestry?: readonly AnyRawRecord[]
	specNamings?: ReadonlyMap<string, AnyRawRecord>
}): ParsedReference | null {
	const { pathValue, ancestry, specNamings } = params
	if (!ancestry) return null

	const keys = pathValue.includes('/') ? [pathValue] : []
	for (let depth = ancestry.length; depth > 0; depth--) {
		const scope = buildPathFromAncestors({ ancestors: ancestry.slice(0, depth), specNamings })
		keys.push(scope ? `${scope}/${pathValue}` : pathValue)
	}

	const [lookupKey, ...fallbackLookupKeys] = [...new Set(keys)]
	return lookupKey ? { lookupKey, fallbackLookupKeys } : null
}

function buildPathFromAncestors(params: {
	ancestors: readonly AnyRawRecord[]
	specNamings?: ReadonlyMap<string, AnyRawRecord>
}): string | null {
	const { ancestors, specNamings } = params
	const parts = ancestors
		.map((ancestor) => getPathSegment(ancestor, { specNaming: specNamings?.get(ancestor.id) }))
		.filter((segment): segment is PathSegment => segment !== null)
	return parts.length > 0 ? joinPathParts(parts) : null
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
			return { lookupKey: pathValue, fallbackLookupKeys: [`${iedName}/${pathValue}`] }
		}
	}
	return { lookupKey: pathValue }
}

// ── behavior-description strategy ────────────────────────────────────

function parseBehaviorDescriptionPath(params: {
	pathAttribute: string
	pathValue: string
	ancestry?: readonly AnyRawRecord[]
	specNamings?: ReadonlyMap<string, AnyRawRecord>
}): ParsedReference | null {
	const { pathAttribute: pathAttrName, pathValue, ancestry, specNamings } = params
	if (!ancestry) return null

	const contextPath = findScopeContextPath({ ancestry, specNamings })
	if (!contextPath) return null

	if (pathAttrName === 'dataName') {
		return { lookupKey: contextPath, qualifier: pathValue }
	}

	// The name is local to the BehaviorDescription's parent: the signal's
	// own name when that parent is its LNode (joined with "."), or the path from that parent down
	// to the LNode, then the name (joined with "/"). The name is kept whole: it may hold dots.
	if (pathAttrName === 'inputName' || pathAttrName === 'outputName') {
		return {
			lookupKey: `${contextPath}.${pathValue}`,
			fallbackLookupKeys: [`${contextPath}/${pathValue}`],
		}
	}

	return null
}

// ── Shared helpers ───────────────────────────────────────────────────

/**
 * Walks ancestry backwards to build the path from ancestors above the
 * nearest BehaviorDescription.
 */
function findScopeContextPath(params: {
	ancestry: readonly AnyRawRecord[]
	specNamings?: ReadonlyMap<string, AnyRawRecord>
}): string | null {
	const { ancestry, specNamings } = params
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
		const seg = getPathSegment(ancestry[i], { specNaming: specNamings?.get(ancestry[i].id) })
		if (seg) parts.push(seg)
	}

	if (parts.length === 0) return null
	return joinPathParts(parts)
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
