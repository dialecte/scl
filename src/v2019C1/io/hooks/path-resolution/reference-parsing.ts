import { getPathSegment, joinPathParts } from './path-segment'
import { UUID_REFERENCE_PAIRS } from './uuid-reference-pairs'

import type { ResolutionType, ParsedReference } from './types'
import type { AnyRawRecord } from '@dialecte/core'

// ── Resolution type lookup ───────────────────────────────────────────

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

// ── Reference path parsing ───────────────────────────────────────────

/**
 * Parses a reference path value to extract the lookup key for index matching.
 *
 * Resolution behavior:
 * See {@link ResolutionType} for the meaning of each resolution strategy.
 */
export function parseReferencePath(
	elementTag: string,
	pathAttribute: string,
	pathValue: string,
	ancestry?: readonly AnyRawRecord[],
): ParsedReference | null {
	const resolution = getResolutionType(elementTag, pathAttribute)
	if (!resolution || resolution === 'unsupported') return null

	if (resolution === 'direct') return { lookupKey: pathValue }

	if (resolution === 'ied-address') {
		if (ancestry) {
			const iedName = findIedNameFromAncestry(ancestry)
			if (iedName) {
				// extRefAddr can be written as an absolute path ("IED1/LD0/LN.DA") or
				// IED-relative ("LD0/LN.DA"). The path index always stores absolute paths,
				// so we try the value as-is first and fall back to prefixing it with the
				// IED name read from the LNode ancestor's iedName attribute.
				return { lookupKey: pathValue, fallbackLookupKey: `${iedName}/${pathValue}` }
			}
		}
		return { lookupKey: pathValue }
	}

	if (resolution === 'lnode') return parseLnodePath(pathValue)

	if (resolution === 'behavior-description') {
		return parseBehaviorDescriptionPath(pathAttribute, pathValue, ancestry)
	}

	return null
}

/**
 * Parses a path value using the `lnode` resolution strategy.
 *
 * Used for attributes that reference an LNode by its hierarchy path, optionally
 * followed by a DO/DA qualifier (e.g. `SourceRef.source`, `ControlRef.controlled`,
 * `DOS.mappedDoName`, `DAS.mappedDaName`).
 *
 * The first "." in the last "/" segment marks the boundary between the LNode ID
 * and the DO/DA chain. The qualifier is extracted but not used for indexing —
 * only the LNode path before the "." is used as the lookup key.
 *
 * @example
 * parseLnodePath("S1/V1/B1/PXCBR1.Pos.stVal")
 * // → { lookupKey: "S1/V1/B1/PXCBR1", qualifier: "Pos.stVal" }
 *
 * parseLnodePath("S1/V1/B1/XCBR1")
 * // → { lookupKey: "S1/V1/B1/XCBR1" }
 */
export function parseLnodePath(pathValue: string): ParsedReference {
	const segments = pathValue.split('/')
	const lastSegment = segments[segments.length - 1]
	const dotIndex = lastSegment.indexOf('.')

	if (dotIndex === -1) {
		return { lookupKey: pathValue }
	}

	const lnSegment = lastSegment.substring(0, dotIndex)
	const qualifier = lastSegment.substring(dotIndex + 1)
	const lookupKey = [...segments.slice(0, -1), lnSegment].join('/')

	return { lookupKey, qualifier: qualifier || undefined }
}

// ── BehaviorDescription resolution ────────────────────────────

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
function stripDisambiguation(value: string): string {
	const parenIndex = value.indexOf('(')
	const dotIndex = value.indexOf('.')

	if (parenIndex !== -1) return value.substring(0, parenIndex)
	if (dotIndex !== -1) return value.substring(0, dotIndex)
	return value
}

function findIedNameFromAncestry(ancestry: readonly AnyRawRecord[]): string | null {
	for (let i = ancestry.length - 1; i >= 0; i--) {
		if (ancestry[i].tagName === 'LNode') {
			return ancestry[i].attributes.find((a) => a.name === 'iedName')?.value ?? null
		}
	}
	return null
}
