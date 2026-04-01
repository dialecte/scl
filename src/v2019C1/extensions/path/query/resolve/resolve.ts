import { getPathSegment } from '../build/path-segment'
import { parseReferencePath, parsePathSegments } from './parse-path'

import { toRawRecord } from '@dialecte/core/helpers'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-mappings'
import { DEFINITION } from '@/v2019C1/definition'

import type { PathSegment } from '../build/path-segment.types'
import type { ResolutionType } from './types'
import type { Scl } from '@/v2019C1/config'
import type { AnyRawRecord } from '@dialecte/core'

// ── Types ────────────────────────────────────────────────────────────

export type ResolveResult = {
	record: Scl.TrackedRecord<Scl.ElementsOf>
	qualifier?: string
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Resolves a reference path attribute to the target record it points to.
 *
 * Infers strategy from UUID_REFERENCE_PAIRS, reads the path value from
 * the record's attributes, parses it, and finds the target via candidate
 * search + ancestry verification.
 *
 * @example
 * // SourceRef with source="S1/B1/PXCBR1.Pos.stVal"
 * const result = await resolve(query, sourceRefRecord, 'source')
 * // → { record: <LNode PXCBR1>, qualifier: "Pos.stVal" }
 */
export async function resolve(
	query: Scl.Query | Scl.Transaction,
	record: Scl.TrackedRecord<Scl.ElementsOf>,
	pathAttribute: string,
): Promise<ResolveResult | undefined> {
	const pair = findReferencePair(record.tagName, pathAttribute)
	if (!pair) return undefined

	const pathValue = record.attributes.find((a) => a.name === pathAttribute)?.value
	if (!pathValue) return undefined

	let ancestry: AnyRawRecord[] | undefined
	if (pair.resolution === 'behavior-description' || pair.resolution === 'ied-address') {
		const ancestors = await query.findAncestors(record)
		// findAncestors returns bottom-up; parseReferencePath expects top-down
		ancestry = [...ancestors].reverse().map((a) => toRawRecord(a) as AnyRawRecord)
	}

	const parsed = parseReferencePath(
		pair.resolution as ResolutionType,
		pathAttribute,
		pathValue,
		ancestry,
	)
	if (!parsed) return undefined

	const segments = parsePathSegments(parsed.lookupKey)
	if (segments.length === 0) return undefined

	const lastSegment = segments[segments.length - 1]
	const expectedAncestry = segments.slice(0, -1)

	const resolved = await findBySegmentAndAncestry({
		query,
		targets: pair.target,
		segment: lastSegment,
		expectedAncestry,
	})

	if (!resolved) return undefined
	return { record: resolved, qualifier: parsed.qualifier }
}

/**
 * Resolves a canonical SCL path to the record it points to.
 * Inverse of {@link buildElementPath}.
 *
 * Walks the tree from root, matching each path segment against children.
 * Transparent elements (AccessPoint, Server) are traversed automatically.
 *
 * @example
 * const record = await resolveByPath(query, "S1/V1/B1/CE1")
 * // → TrackedRecord for ConductingEquipment name="CE1"
 */
export async function resolveByPath(
	query: Scl.Query | Scl.Transaction,
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

// ── Internal: reference pair lookup ──────────────────────────────────

type ReferencePairs = typeof UUID_REFERENCE_PAIRS
type ReferencePairEntry = ReferencePairs[keyof ReferencePairs][number]

function findReferencePair(tagName: string, pathAttribute: string): ReferencePairEntry | undefined {
	const pairs = UUID_REFERENCE_PAIRS[tagName as keyof ReferencePairs]
	if (!pairs) return undefined
	return (pairs as readonly ReferencePairEntry[]).find((p) => p.attribute.path === pathAttribute)
}

// ── Internal: candidate search + ancestry verification ───────────────

/** Valid lnClass values from the definition, used to decompose composite path segments. */
const LN_CLASS_VALUES: ReadonlySet<string> = new Set(
	DEFINITION.LNode.attributes.details.lnClass.facets.enumeration,
)

/** Maps lnClass-based element tags to their instance attribute name. */
const LN_CLASS_INST_ATTR: Record<string, string> = {
	LNode: 'lnInst',
	LN: 'inst',
	LN0: 'inst',
}

/**
 * Decompose a composite segment (prefix+lnClass+inst) into its parts.
 * Uses the definition's lnClass enumeration to identify the 4-char lnClass
 * within the segment string.
 */
export function decomposeLnClassSegment(
	segment: string,
): { prefix: string; lnClass: string; inst: string } | null {
	for (let i = 0; i <= segment.length - 4; i++) {
		const candidate = segment.substring(i, i + 4)
		if (LN_CLASS_VALUES.has(candidate)) {
			return {
				prefix: segment.substring(0, i),
				lnClass: candidate,
				inst: segment.substring(i + 4),
			}
		}
	}
	return null
}

async function findBySegmentAndAncestry(params: {
	query: Scl.Query | Scl.Transaction
	targets: readonly string[]
	segment: PathSegment
	expectedAncestry: PathSegment[]
}): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined> {
	const { query, targets, segment, expectedAncestry } = params

	for (const tagName of targets) {
		const instAttr = LN_CLASS_INST_ATTR[tagName]

		if (instAttr) {
			const found = await findLnClassTarget({
				query,
				tagName,
				segment,
				instAttr,
				expectedAncestry,
			})
			if (found) return found
		} else {
			const found = await findBySegmentScan({
				query,
				tagName,
				segment,
				expectedAncestry,
			})
			if (found) return found
		}
	}

	return undefined
}

/** Decompose segment and use findByAttributes for lnClass-based elements. */
async function findLnClassTarget(params: {
	query: Scl.Query | Scl.Transaction
	tagName: string
	segment: PathSegment
	instAttr: string
	expectedAncestry: PathSegment[]
}): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined> {
	const { query, tagName, segment, instAttr, expectedAncestry } = params

	const parts = decomposeLnClassSegment(segment.segment)
	if (!parts) return undefined

	// findByAttributes narrows by lnClass (always non-empty).
	// prefix and inst may be empty — findByAttributes rejects empty values,
	// so we verify those manually after the query.
	const records = await query.findByAttributes({
		tagName: tagName as Scl.ElementsOf,
		attributes: { lnClass: parts.lnClass } as Record<string, string>,
	})

	for (const record of records) {
		const prefix = record.attributes.find((a) => a.name === 'prefix')?.value ?? ''
		const inst = record.attributes.find((a) => a.name === instAttr)?.value ?? ''
		if (prefix !== parts.prefix || inst !== parts.inst) continue

		if (await matchesAncestry(query, record, expectedAncestry)) {
			return record as Scl.TrackedRecord<Scl.ElementsOf>
		}
	}

	return undefined
}

/** Original segment-string comparison for non-lnClass elements. */
async function findBySegmentScan(params: {
	query: Scl.Query | Scl.Transaction
	tagName: string
	segment: PathSegment
	expectedAncestry: PathSegment[]
}): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined> {
	const { query, tagName, segment, expectedAncestry } = params

	const records = await query.getRecordsByTagName(tagName as Scl.ElementsOf)

	for (const record of records) {
		const seg = getPathSegment(toRawRecord(record))
		if (!seg || seg.segment !== segment.segment) continue

		if (await matchesAncestry(query, record, expectedAncestry)) {
			return record as Scl.TrackedRecord<Scl.ElementsOf>
		}
	}

	return undefined
}

async function matchesAncestry(
	query: Scl.Query | Scl.Transaction,
	candidate: Scl.TrackedRecord<Scl.ElementsOf>,
	expectedSegments: PathSegment[],
): Promise<boolean> {
	if (expectedSegments.length === 0) return true

	const ancestors = await query.findAncestors(candidate)

	// findAncestors returns bottom-up [parent, grandparent, …]
	// Build top-down segments, skipping transparent elements
	const ancestorSegments: PathSegment[] = []
	for (let i = ancestors.length - 1; i >= 0; i--) {
		const seg = getPathSegment(toRawRecord(ancestors[i]))
		if (seg) ancestorSegments.push(seg)
	}

	if (ancestorSegments.length !== expectedSegments.length) return false
	return ancestorSegments.every((seg, i) => seg.segment === expectedSegments[i].segment)
}

// ── Internal: tree walk (for resolveByPath) ──────────────────────────

async function walkSegments(params: {
	query: Scl.Query | Scl.Transaction
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
			return walkSegments({ query, current: child, segments, index: index + 1 })
		}
	}

	return undefined
}
