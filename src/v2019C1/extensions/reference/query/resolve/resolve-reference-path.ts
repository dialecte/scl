import { buildElementPath } from '../build/build-element-path'
import { functionBaseOf, isFunctionScoped } from '../build/function-scope'
import { getPathSegment } from '../build/path-segment'
import { readSpecNamings } from '../build/spec-namings'
import { parseReferencePath, parsePathSegments, splitLnodeQualifier } from './parse-path'
import { resolveMappedData } from './resolve-mapped-data'
import { LN_CLASS_INST_ATTR, LN_CLASS_VALUES } from './resolve-reference-path.constants'

import { toRawRecord } from '@dialecte/core/helpers'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { MAPPED_NAME_REFS, RESOLUTION_TYPE } from '@/v2019C1/extensions/reference'
import { SIGNAL_TAG_NAMES } from '@/v2019C1/extensions/reference/constants/path-extraction'

import type { PathSegment } from '../build/path-segment.types'
import type { ResolveResult } from './resolve-reference-path.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { ReferencePair, ResolutionType } from '@/v2019C1/extensions/reference'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

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
	query: Core.Query<Config> | Core.Transaction<Config>,
	record: Scl.TrackedRecord<Scl.ElementsOf>,
	pathAttribute: string,
): Promise<ResolveResult | undefined> {
	const pair = findReferencePair(record.tagName, pathAttribute)
	if (!pair) return undefined

	// A DOS / SDS / DAS is implemented even when it names nothing: it follows its default.
	if (MAPPED_NAME_REFS.has(record.tagName)) {
		const mappedData = await resolveMappedData(query, {
			reference: { tagName: record.tagName, id: record.id } as Scl.Ref<'DOS' | 'SDS' | 'DAS'>,
		})
		if (!mappedData) return undefined
		const ln = await query.getRecord(mappedData.ln)
		if (!ln) return undefined
		return {
			record: ln as Scl.TrackedRecord<Scl.ElementsOf>,
			qualifier: mappedData.dataPath.join('.'),
		}
	}

	const pathValue = record.attributes.find((a) => a.name === pathAttribute)?.value
	if (!pathValue) return undefined

	// Fast path: resolve via UUID when available (exact, no ambiguity)
	const uuidResolved = await resolveByUuid(query, record, pair)
	if (uuidResolved)
		return { record: uuidResolved, qualifier: parseQualifier(pair, pathAttribute, pathValue) }

	// Fallback: path-based resolution
	let ancestry: AnyRawRecord[] | undefined
	let specNamings: ReadonlyMap<string, AnyRawRecord> | undefined
	if (
		pair.resolution === RESOLUTION_TYPE.behaviorDescription ||
		pair.resolution === RESOLUTION_TYPE.iedAddress ||
		pair.resolution === RESOLUTION_TYPE.ancestorName
	) {
		const ancestors = await query.findAncestors(record, { order: 'top-down' })
		ancestry = ancestors.map((ancestor) => toRawRecord(ancestor) as AnyRawRecord)
		specNamings = await readSpecNamings(query, { records: ancestry })
	}

	const functionBase = isFunctionScoped(pair)
		? await functionBaseOfReferrer(query, { record })
		: undefined
	if (isFunctionScoped(pair) && functionBase === undefined) return undefined

	const parsed = parseReferencePath({
		resolution: pair.resolution as ResolutionType,
		pathAttribute,
		pathValue,
		ancestry,
		specNamings,
		functionBase,
	})
	if (!parsed) return undefined

	// A signal (SourceRef / ControlRef) is named among its siblings and its name may hold dots:
	// it is found by its whole path, never by splitting the path into segments.
	if (pair.target.every((tagName) => SIGNAL_TAG_NAMES.has(tagName))) {
		const signal = await findSignalByPath({
			query,
			targets: pair.target,
			paths: [parsed.lookupKey, ...(parsed.fallbackLookupKeys ?? [])],
		})
		return signal ? { record: signal, qualifier: parsed.qualifier } : undefined
	}

	// The keys in order: the first one naming an element wins (nearest scope first for a name).
	for (const key of [parsed.lookupKey, ...(parsed.fallbackLookupKeys ?? [])]) {
		const segments = parsePathSegments(key)
		if (segments.length === 0) continue

		const resolved = await findBySegmentAndAncestry({
			query,
			targets: pair.target,
			segment: segments[segments.length - 1],
			expectedAncestry: segments.slice(0, -1),
		})
		if (resolved) return { record: resolved, qualifier: parsed.qualifier }
	}

	return undefined
}

/**
 * The path of the Function a signal role's reference starts below: the Function, or the nearest
 * one above the SubFunction, that its `FunctionRef` names.
 */
async function functionBaseOfReferrer(
	query: Core.Query<Config> | Core.Transaction<Config>,
	params: { record: Scl.TrackedRecord<Scl.ElementsOf> },
): Promise<string | undefined> {
	const ancestors = await query.findAncestors(params.record)
	const functionRef = ancestors.find((ancestor) => ancestor.tagName === 'FunctionRef')
	if (!functionRef) return undefined
	const named = await resolveReferencePath(
		query,
		functionRef as Scl.TrackedRecord<Scl.ElementsOf>,
		'function',
	)
	if (!named) return undefined
	const functionPath = await buildElementPath(query, {
		tagName: named.record.tagName,
		id: named.record.id,
	} as Scl.Ref<Scl.ElementsOf>)
	return functionPath ? (functionBaseOf(functionPath) ?? undefined) : undefined
}

// ── Internal: reference pair lookup ──────────────────────────────────

function findReferencePair(tagName: string, pathAttribute: string): ReferencePair | undefined {
	const pairs = UUID_REFERENCE_PAIRS[tagName as keyof typeof UUID_REFERENCE_PAIRS]
	if (!pairs) return undefined
	return (pairs as readonly ReferencePair[]).find((pair) => pair.attribute.path === pathAttribute)
}

// ── Internal: UUID-based resolution (fast path) ──────────────────────

/**
 * Resolves via the companion UUID attribute when present on the record.
 * This is exact and handles all disambiguation cases (e.g. same input
 * name with different pDA).
 */
async function resolveByUuid(
	query: Core.Query<Config> | Core.Transaction<Config>,
	record: Scl.TrackedRecord<Scl.ElementsOf>,
	pair: ReferencePair,
): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined> {
	const uuidAttrName = pair.attribute.uuid
	const uuidValue = record.attributes.find((a) => a.name === uuidAttrName)?.value
	if (!uuidValue) return undefined

	for (const tagName of pair.target) {
		const matches = await query.findByAttributes({
			tagName: tagName as Scl.ElementsOf,
			attributes: { uuid: uuidValue } as Record<string, string>,
		})
		if (matches.length > 0) return matches[0] as Scl.TrackedRecord<Scl.ElementsOf>
	}

	return undefined
}

/**
 * Extracts the qualifier from the path value without full path resolution.
 * - lnode: qualifier is DO.DA suffix after LNode segment (e.g. "Pos.stVal")
 * - behaviorDescription + dataName: the path value itself is the qualifier
 * - behaviorDescription + inputName/outputName: no qualifier (target IS the ref)
 */
function parseQualifier(
	pair: ReferencePair,
	pathAttribute: string,
	pathValue: string,
): string | undefined {
	if (pair.resolution === RESOLUTION_TYPE.lnode) {
		return splitLnodeQualifier(pathValue).qualifier
	}
	if (pair.resolution === RESOLUTION_TYPE.behaviorDescription && pathAttribute === 'dataName') {
		return pathValue
	}
	return undefined
}

// ── Internal: candidate search + ancestry verification ───────────────

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
	query: Core.Query<Config> | Core.Transaction<Config>
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
	query: Core.Query<Config> | Core.Transaction<Config>
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

/** The signal whose path, built among its siblings, is one of `paths`. */
async function findSignalByPath(params: {
	query: Core.Query<Config> | Core.Transaction<Config>
	targets: readonly string[]
	paths: readonly string[]
}): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined> {
	const { query, targets, paths } = params

	for (const tagName of targets) {
		const records = await query.getRecordsByTagName(tagName as Scl.ElementsOf)
		for (const record of records) {
			const elementPath = await buildElementPath(query, record as Scl.Ref<Scl.ElementsOf>)
			if (elementPath && paths.includes(elementPath.path)) {
				return record as Scl.TrackedRecord<Scl.ElementsOf>
			}
		}
	}

	return undefined
}

async function findBySegmentScan(params: {
	query: Core.Query<Config> | Core.Transaction<Config>
	tagName: string
	segment: PathSegment
	expectedAncestry: PathSegment[]
}): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined> {
	const { query, tagName, segment, expectedAncestry } = params

	const records = await query.getRecordsByTagName(tagName as Scl.ElementsOf)
	const specNamings = await readSpecNamings(query, { records: records.map(toRawRecord) })

	for (const record of records) {
		const seg = getPathSegment(toRawRecord(record), { specNaming: specNamings.get(record.id) })
		if (!seg || seg.segment !== segment.segment) continue

		if (await matchesAncestry(query, record, expectedAncestry)) {
			return record as Scl.TrackedRecord<Scl.ElementsOf>
		}
	}

	return undefined
}

async function matchesAncestry(
	query: Core.Query<Config> | Core.Transaction<Config>,
	candidate: Scl.TrackedRecord<Scl.ElementsOf>,
	expectedSegments: PathSegment[],
): Promise<boolean> {
	if (expectedSegments.length === 0) return true

	const ancestors = await query.findAncestors(candidate)
	const specNamings = await readSpecNamings(query, { records: ancestors.map(toRawRecord) })

	// findAncestors returns bottom-up [parent, grandparent, …]
	// Build top-down segments, skipping transparent elements
	const ancestorSegments: PathSegment[] = []
	for (let i = ancestors.length - 1; i >= 0; i--) {
		const seg = getPathSegment(toRawRecord(ancestors[i]), {
			specNaming: specNamings.get(ancestors[i].id),
		})
		if (seg) ancestorSegments.push(seg)
	}

	if (ancestorSegments.length !== expectedSegments.length) return false
	return ancestorSegments.every((seg, i) => seg.segment === expectedSegments[i].segment)
}
