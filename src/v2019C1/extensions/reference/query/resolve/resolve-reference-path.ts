import { getPathSegment } from '../build/path-segment'
import { parseReferencePath, parsePathSegments } from './parse-path'

import { toRawRecord } from '@dialecte/core/helpers'

import { DEFINITION } from '@/v2019C1/definition'
import { RESOLUTION_TYPE, UUID_REFERENCE_PAIRS } from '@/v2019C1/extensions/reference'

import type { PathSegment } from '../build/path-segment.types'
import type { Scl } from '@/v2019C1/config'
import type { ResolutionType } from '@/v2019C1/extensions/reference'
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
export async function resolveReferencePath(
	query: Scl.Query | Scl.Transaction,
	record: Scl.TrackedRecord<Scl.ElementsOf>,
	pathAttribute: string,
): Promise<ResolveResult | undefined> {
	const pair = findReferencePair(record.tagName, pathAttribute)
	if (!pair) return undefined

	const pathValue = record.attributes.find((a) => a.name === pathAttribute)?.value
	if (!pathValue) return undefined

	let ancestry: AnyRawRecord[] | undefined
	if (
		pair.resolution === RESOLUTION_TYPE.behaviorDescription ||
		pair.resolution === RESOLUTION_TYPE.iedAddress
	) {
		const ancestors = await query.findAncestors(record, { order: 'top-down' })
		ancestry = ancestors.map((a) => toRawRecord(a) as AnyRawRecord)
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

// ── Internal: reference pair lookup ──────────────────────────────────

type ReferencePairs = typeof UUID_REFERENCE_PAIRS
type ReferencePairEntry = ReferencePairs[keyof ReferencePairs][number]

function findReferencePair(tagName: string, pathAttribute: string): ReferencePairEntry | undefined {
	const pairs = UUID_REFERENCE_PAIRS[tagName as keyof ReferencePairs]
	if (!pairs) return undefined
	return (pairs as readonly ReferencePairEntry[]).find((p) => p.attribute.path === pathAttribute)
}

// ── Internal: candidate search + ancestry verification ───────────────

const LN_CLASS_VALUES: ReadonlySet<string> = new Set(
	DEFINITION.LNode.attributes.details.lnClass.facets.enumeration,
)

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
