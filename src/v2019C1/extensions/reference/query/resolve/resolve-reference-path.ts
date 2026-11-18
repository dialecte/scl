import { functionBaseOf, isFunctionScoped } from '../build/function-scope'
import { nameScopeOf } from '../build/name-scope'
import { fullSignalName, getPathSegment, joinPathParts } from '../build/path-segment'
import { nameAmongSiblings } from '../build/signal-name'
import { runWithBatchedReads } from './batched-reads'
import { parseReferencePath, parsePathSegments, splitLnodeQualifier } from './parse-path'
import { resolveMappedData } from './resolve-mapped-data'
import { LN_CLASS_INST_ATTR, LN_CLASS_VALUES } from './resolve-reference-path.constants'

import { toRawRecord } from '@dialecte/core/helpers'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { MAPPED_NAME_REFS, RESOLUTION_TYPE } from '@/v2019C1/extensions/reference'
import { SIGNAL_TAG_NAMES } from '@/v2019C1/extensions/reference/constants/path-extraction'
import { readAttribute } from '@/v2019C1/helpers'

import type { ElementPath, PathSegment } from '../build/path-segment.types'
import type {
	BatchedReads,
	ElementRef,
	FunctionBases,
	FunctionBasesCache,
	ResolveReferencePathsParams,
	ResolveReferencePathsResult,
	ResolveResult,
} from './resolve-reference-path.types'
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
 * @intent follow a reference to its target, element a SourceRef/ControlRef/FunctionRef path points to, resolve a path attribute to a record
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
	const [result] = await resolveReferencePaths(query, { records: [record], pathAttribute })
	return result
}

/**
 * Resolves the reference path attribute `pathAttribute` of many records at once: one answer per record, in input
 * order, each what `resolveReferencePath` answers for it (`undefined` for a record whose tag has no such pair, a path
 * naming nothing, a record with no value).
 *
 * Each record runs the steps of `resolveReferencePath`; the reads of all the records are merged: one
 * `findByAttributes` per target tag and attribute with every value asked (the uuid fast path, names, classes), the
 * ancestors in one `findAncestorsOfEach`, the paths of the signals searched one candidate per record at a time, each
 * round in one `buildElementPaths`, each signal tag read once. A DOS / SDS / DAS reads its mapped data on its own. A record never costs more reads than alone.
 *
 * @intent resolve many reference paths at once, follow the references of many SourceRefs/ControlRefs to their targets, batch reference resolution
 *
 * @example
 * const [first, second] = await resolveReferencePaths(query, { records: sourceRefs, pathAttribute: 'source' })
 * // → [{ record: <LNode PXCBR1>, qualifier: "Pos.stVal" }, undefined]
 */
export async function resolveReferencePaths(
	query: Core.Query<Config> | Core.Transaction<Config>,
	params: ResolveReferencePathsParams,
): Promise<ResolveReferencePathsResult> {
	const { pathAttribute } = params
	// the FunctionRefs of the call read their bases once
	const cache: FunctionBasesCache = new Map()
	const results = await runWithBatchedReads<
		Scl.TrackedRecord<Scl.ElementsOf>,
		ResolveResult | undefined
	>({
		query,
		items: params.records,
		resolve: (reads, record) => resolveOne({ query, reads, record, pathAttribute, cache }),
	})
	// the reads of the call are shared: each answer gets its own copy of its record, as one resolve per record gave it
	return results.map((result) =>
		result ? { ...result, record: structuredClone(result.record) } : undefined,
	)
}

/** The steps of one record's resolve, its reads asked of `reads`. */
async function resolveOne(params: {
	query: Core.Query<Config> | Core.Transaction<Config>
	reads: BatchedReads
	record: Scl.TrackedRecord<Scl.ElementsOf>
	pathAttribute: string
	cache?: FunctionBasesCache
}): Promise<ResolveResult | undefined> {
	const { query, reads, record, pathAttribute, cache } = params
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

	const pathValue = readAttribute({ record, name: pathAttribute, defaults: 'none' })
	if (!pathValue) return undefined

	// Fast path: resolve via UUID when available (exact, no ambiguity)
	const uuidResolved = await resolveByUuidWith({ reads, record, pair })
	if (uuidResolved)
		return { record: uuidResolved, qualifier: parseQualifier({ pair, pathAttribute, pathValue }) }

	// Fallback: path-based resolution
	return resolveByPath({ query, reads, record, pair, pathAttribute, pathValue, cache })
}

/** The target a record's path names when its uuid names none: parsed, then searched by its kind. */
async function resolveByPath(params: {
	query: Core.Query<Config> | Core.Transaction<Config>
	reads: BatchedReads
	record: Scl.TrackedRecord<Scl.ElementsOf>
	pair: ReferencePair
	pathAttribute: string
	pathValue: string
	cache?: FunctionBasesCache
}): Promise<ResolveResult | undefined> {
	const { query, reads, record, pair, pathAttribute, pathValue, cache } = params
	let ancestry: AnyRawRecord[] | undefined
	let specNamings: ReadonlyMap<string, AnyRawRecord> | undefined
	if (
		pair.resolution === RESOLUTION_TYPE.behaviorDescription ||
		pair.resolution === RESOLUTION_TYPE.iedAddress ||
		pair.resolution === RESOLUTION_TYPE.ancestorName ||
		pair.resolution === RESOLUTION_TYPE.scopedName
	) {
		const ancestors = await reads.ancestorsOf(record)
		ancestry = [...ancestors].reverse().map((ancestor) => toRawRecord(ancestor) as AnyRawRecord)
		specNamings = await reads.specNamingsOf({ records: ancestry })
	}

	// a FunctionRef naming nothing gives no base: the path is then read as written, the absolute form
	const functionBases = isFunctionScoped(pair)
		? await functionBasesWith({ query, reads, record, cache })
		: undefined

	const parsed = parseReferencePath({
		resolution: pair.resolution as ResolutionType,
		pathAttribute,
		pathValue,
		ancestry,
		specNamings,
		functionBase: functionBases?.functionPath.path,
		formerFunctionBase: functionBases?.formerBase,
		nameScope: nameScopeOf(pair),
	})
	if (!parsed) return undefined

	// A name unique in its scope is found among the targets of that scope; the key the import index
	// reads it by is not a path, only the full path an earlier version wrote is.
	const scopedName = pair.resolution === RESOLUTION_TYPE.scopedName
	if (scopedName) {
		const named = await findNamedInScope({ reads, pair, name: pathValue, ancestry })
		if (named) return { record: named }
	}

	// A signal (SourceRef / ControlRef) is named among its siblings and its name may hold dots:
	// it is found by its whole path, never by splitting the path into segments.
	if (pair.target.every((tagName) => SIGNAL_TAG_NAMES.has(tagName))) {
		const signal = await findSignalByPath({
			reads,
			targets: pair.target,
			paths: [parsed.lookupKey, ...(parsed.fallbackLookupKeys ?? [])],
		})
		return signal ? { record: signal, qualifier: parsed.qualifier } : undefined
	}

	// The keys in order: the first one naming an element wins (nearest scope first for a name).
	const keys = scopedName
		? (parsed.fallbackLookupKeys ?? [])
		: [parsed.lookupKey, ...(parsed.fallbackLookupKeys ?? [])]
	for (const key of keys) {
		const segments = parsePathSegments(key)
		if (segments.length === 0) continue

		const resolved = await findBySegmentAndAncestry({
			reads,
			targets: pair.target,
			segment: segments[segments.length - 1],
			expectedAncestry: segments.slice(0, -1),
		})
		if (resolved) return { record: resolved, qualifier: parsed.qualifier }
	}

	return undefined
}

/**
 * Where a signal role's reference starts its path: see `functionBasesOfFunctionRef`, for the
 * `FunctionRef` above `params.record`. `undefined` when the referrer has no FunctionRef. A loop over
 * the references of one operation passes a `cache` so the bases are read once per FunctionRef.
 */
export async function functionBasesOfReferrer(
	query: Core.Query<Config> | Core.Transaction<Config>,
	params: { record: Scl.TrackedRecord<Scl.ElementsOf>; cache?: FunctionBasesCache },
): Promise<FunctionBases | undefined> {
	const [bases] = await runWithBatchedReads<
		Scl.TrackedRecord<Scl.ElementsOf>,
		FunctionBases | undefined
	>({
		query,
		items: [params.record],
		resolve: (reads, record) => functionBasesWith({ query, reads, record, cache: params.cache }),
	})
	return bases
}

/** `functionBasesOfReferrer` with its reads asked of `reads`: merged with the other records of the call. */
async function functionBasesWith(params: {
	query: Core.Query<Config> | Core.Transaction<Config>
	reads: BatchedReads
	record: Scl.TrackedRecord<Scl.ElementsOf>
	cache?: FunctionBasesCache
}): Promise<FunctionBases | undefined> {
	const { query, reads, cache } = params
	// parent by parent: a signal role reference is two levels below its FunctionRef
	const functionRefRef = await nearestAncestorOfTag({
		reads,
		record: params.record,
		tagName: 'FunctionRef',
	})
	const functionRef = functionRefRef ? await reads.getRecord(functionRefRef) : undefined
	if (!functionRef) return undefined

	// keyed by what the FunctionRef names, so a FunctionRef retargeted meanwhile is read again
	const key = JSON.stringify([
		functionRef.id,
		readAttribute({ record: functionRef, name: 'functionUuid', defaults: 'none' }),
		readAttribute({ record: functionRef, name: 'function', defaults: 'none' }),
	])
	if (cache?.has(key)) return cache.get(key)
	const bases = await functionBasesOfFunctionRefWith({ query, reads, functionRef })
	cache?.set(key, bases)
	return bases
}

/**
 * Where the signal role references below a `FunctionRef` start their path: the path of the function
 * it names (a Function, SubFunction, EqFunction or EqSubFunction), and the path of the Function (or
 * EqFunction) nearest above it, or at it, the base an earlier version wrote the path from.
 * `undefined` when the FunctionRef names nothing.
 */
export async function functionBasesOfFunctionRef(
	query: Core.Query<Config> | Core.Transaction<Config>,
	params: { functionRef: Scl.TrackedRecord<Scl.ElementsOf> },
): Promise<FunctionBases | undefined> {
	const [bases] = await runWithBatchedReads<
		Scl.TrackedRecord<Scl.ElementsOf>,
		FunctionBases | undefined
	>({
		query,
		items: [params.functionRef],
		resolve: (reads, functionRef) => functionBasesOfFunctionRefWith({ query, reads, functionRef }),
	})
	return bases
}

/** `functionBasesOfFunctionRef` with its reads asked of `reads`: merged with the other records of the call. */
async function functionBasesOfFunctionRefWith(params: {
	query: Core.Query<Config> | Core.Transaction<Config>
	reads: BatchedReads
	functionRef: Scl.TrackedRecord<Scl.ElementsOf>
}): Promise<FunctionBases | undefined> {
	const { query, reads, functionRef } = params
	const named = await resolveOne({ query, reads, record: functionRef, pathAttribute: 'function' })
	if (!named) return undefined
	const functionPath = await reads.elementPathOf(named.record)
	if (!functionPath) return undefined
	return { functionPath, formerBase: functionBaseOf(functionPath) ?? undefined }
}

/**
 * The target of `pair` named `name` whose nearest `nameScope` ancestor is the referrer's (the last
 * of that tag in `ancestry`): a variant of the Application holding the reference. `undefined` when
 * the referrer has no such ancestor or no target of the scope has that name.
 */
async function findNamedInScope(params: {
	reads: BatchedReads
	pair: ReferencePair
	name: string
	ancestry: readonly AnyRawRecord[] | undefined
}): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined> {
	const { reads, pair, name, ancestry } = params
	const nameScope = nameScopeOf(pair)
	const scope = ancestry?.findLast((ancestor) => ancestor.tagName === nameScope)
	if (!nameScope || !scope) return undefined

	for (const tagName of pair.target) {
		const candidates = await reads.findByAttribute({ tagName, attribute: 'name', value: name })
		for (const candidate of candidates) {
			const candidateScope = await nearestAncestorOfTag({
				reads,
				record: candidate,
				tagName: nameScope,
			})
			if (candidateScope?.id === scope.id) return candidate
		}
	}
	return undefined
}

/** The nearest ancestor of `record` of `tagName`, read parent by parent. */
async function nearestAncestorOfTag(params: {
	reads: BatchedReads
	record: Scl.TrackedRecord<Scl.ElementsOf>
	tagName: string
}): Promise<ElementRef | undefined> {
	const { reads, tagName } = params
	let parent = params.record.parent as ElementRef | null
	while (parent && parent.tagName !== tagName) {
		const parentRecord = await reads.getRecord(parent)
		parent = (parentRecord?.parent ?? null) as ElementRef | null
	}
	return parent ?? undefined
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
export async function resolveByUuid(
	query: Core.Query<Config> | Core.Transaction<Config>,
	record: Scl.TrackedRecord<Scl.ElementsOf>,
	pair: ReferencePair,
): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined> {
	const [resolved] = await runWithBatchedReads<
		Scl.TrackedRecord<Scl.ElementsOf>,
		Scl.TrackedRecord<Scl.ElementsOf> | undefined
	>({
		query,
		items: [record],
		resolve: (reads, item) => resolveByUuidWith({ reads, record: item, pair }),
	})
	return resolved
}

/** `resolveByUuid` with its lookups asked of `reads`: one value list per target tag for the call. */
async function resolveByUuidWith(params: {
	reads: BatchedReads
	record: Scl.TrackedRecord<Scl.ElementsOf>
	pair: ReferencePair
}): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined> {
	const { reads, record, pair } = params
	const uuidValue = readAttribute({ record, name: pair.attribute.uuid, defaults: 'none' })
	if (!uuidValue) return undefined

	for (const tagName of pair.target) {
		const matches = await reads.findByAttribute({ tagName, attribute: 'uuid', value: uuidValue })
		if (matches.length > 0) return matches[0]
	}

	return undefined
}

/**
 * Extracts the qualifier from the path value without full path resolution.
 * - lnode: qualifier is DO.DA suffix after LNode segment (e.g. "Pos.stVal")
 * - behaviorDescription + dataName: the path value itself is the qualifier
 * - behaviorDescription + inputName/outputName: no qualifier (target IS the ref)
 */
export function parseQualifier(params: {
	pair: ReferencePair
	pathAttribute: string
	pathValue: string
}): string | undefined {
	const { pair, pathAttribute, pathValue } = params
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
	for (let start = 0; start <= segment.length - 4; start++) {
		const candidate = segment.substring(start, start + 4)
		if (LN_CLASS_VALUES.has(candidate)) {
			return {
				prefix: segment.substring(0, start),
				lnClass: candidate,
				inst: segment.substring(start + 4),
			}
		}
	}
	return null
}

async function findBySegmentAndAncestry(params: {
	reads: BatchedReads
	targets: readonly string[]
	segment: PathSegment
	expectedAncestry: PathSegment[]
}): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined> {
	const { reads, targets, segment, expectedAncestry } = params

	for (const tagName of targets) {
		const instanceAttribute = LN_CLASS_INST_ATTR[tagName]
		const found = instanceAttribute
			? await findLnClassTarget({ reads, tagName, segment, instanceAttribute, expectedAncestry })
			: await findBySegmentScan({ reads, tagName, segment, expectedAncestry })
		if (found) return found
	}

	return undefined
}

async function findLnClassTarget(params: {
	reads: BatchedReads
	tagName: string
	segment: PathSegment
	instanceAttribute: string
	expectedAncestry: PathSegment[]
}): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined> {
	const { reads, tagName, segment, instanceAttribute, expectedAncestry } = params

	const parts = decomposeLnClassSegment(segment.segment)
	if (!parts) return undefined

	// findByAttributes narrows by lnClass (always non-empty).
	// prefix and inst may be empty — findByAttributes rejects empty values,
	// so we verify those manually after the query.
	const records = await reads.findByAttribute({
		tagName,
		attribute: 'lnClass',
		value: parts.lnClass,
	})

	for (const record of records) {
		const prefix = readAttribute({ record, name: 'prefix', defaults: 'none' })
		const inst = readAttribute({ record, name: instanceAttribute, defaults: 'none' })
		if (prefix !== parts.prefix || inst !== parts.inst) continue

		if (await matchesAncestry({ reads, candidate: record, expectedSegments: expectedAncestry })) {
			return record
		}
	}

	return undefined
}

/**
 * The signal named by the first of `paths` that names one, the keys in order: a signal's path, built
 * among its siblings, or with its full name (its instance and data attribute, whatever its siblings)
 * is the key. Among the signals of one key, the first in the document.
 *
 * Only a signal one of the keys can name has its path built: a signal's path ends with its segment, its own name or
 * its full name, and its full path ends with its full name; a signal without a name has no path.
 */
async function findSignalByPath(params: {
	reads: BatchedReads
	targets: readonly string[]
	paths: readonly string[]
}): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined> {
	const { reads, targets, paths } = params

	let best: { keyIndex: number; record: Scl.TrackedRecord<Scl.ElementsOf> } | undefined
	for (const tagName of targets) {
		const records = await reads.recordsOfTag(tagName)
		for (const record of records) {
			if (!isNamedByAKey({ record, paths })) continue
			const elementPath = await reads.elementPathOf(record)
			if (!elementPath) continue
			const fullPath = fullSignalPath({ record: toRawRecord(record), elementPath })
			const keyIndex = [elementPath.path, fullPath]
				.map((path) => (path === null ? -1 : paths.indexOf(path)))
				.filter((index) => index !== -1)
				.reduce((first, index) => Math.min(first, index), paths.length)
			if (keyIndex === paths.length || (best && keyIndex >= best.keyIndex)) continue
			best = { keyIndex, record }
			// the first key names it: no later signal can name it better
			if (keyIndex === 0) return best.record
		}
	}

	return best?.record
}

/** Whether one of `paths` ends with the signal's name or its full name: none other can name it. */
function isNamedByAKey(params: {
	record: Scl.TrackedRecord<Scl.ElementsOf>
	paths: readonly string[]
}): boolean {
	const { record, paths } = params
	const raw = toRawRecord(record)
	const name = nameAmongSiblings({ record: raw, siblings: [raw] })
	const fullName = fullSignalName(raw)
	if (!name || !fullName) return false
	return paths.some((path) => path.endsWith(name) || path.endsWith(fullName))
}

/** The path of a signal named with its full name below its LNode, `null` when it has none. */
function fullSignalPath(params: { record: AnyRawRecord; elementPath: ElementPath }): string | null {
	const { record, elementPath } = params
	const name = fullSignalName(record)
	const parentSegments = elementPath.segments.slice(0, -1)
	if (!name || parentSegments.length === 0) return null
	return `${joinPathParts(parentSegments)}.${name}`
}

async function findBySegmentScan(params: {
	reads: BatchedReads
	tagName: string
	segment: PathSegment
	expectedAncestry: PathSegment[]
}): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined> {
	const { reads, tagName, segment, expectedAncestry } = params

	const records = await reads.recordsOfTag(tagName)
	const specNamings = await reads.specNamingsOf({
		records: records.map(toRawRecord),
		tagName,
	})

	for (const record of records) {
		const seg = getPathSegment(toRawRecord(record), { specNaming: specNamings.get(record.id) })
		if (!seg || seg.segment !== segment.segment) continue

		if (await matchesAncestry({ reads, candidate: record, expectedSegments: expectedAncestry })) {
			return record
		}
	}

	return undefined
}

async function matchesAncestry(params: {
	reads: BatchedReads
	candidate: Scl.TrackedRecord<Scl.ElementsOf>
	expectedSegments: PathSegment[]
}): Promise<boolean> {
	const { reads, candidate, expectedSegments } = params
	if (expectedSegments.length === 0) return true

	const ancestors = await reads.ancestorsOf(candidate)
	const specNamings = await reads.specNamingsOf({ records: ancestors.map(toRawRecord) })

	// findAncestors returns bottom-up [parent, grandparent, …]
	// Build top-down segments, skipping transparent elements
	const ancestorSegments: PathSegment[] = []
	for (const ancestor of [...ancestors].reverse()) {
		const seg = getPathSegment(toRawRecord(ancestor), { specNaming: specNamings.get(ancestor.id) })
		if (seg) ancestorSegments.push(seg)
	}

	if (ancestorSegments.length !== expectedSegments.length) return false
	return ancestorSegments.every((seg, index) => seg.segment === expectedSegments[index].segment)
}
