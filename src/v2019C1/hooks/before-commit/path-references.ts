import { foldChanges, readTags } from './tuple-reference-changes'

import { throwDialecteError } from '@dialecte/core'
import { toRawRecord } from '@dialecte/core/helpers'

import { TARGET_ELEMENT_TYPES } from '@/v2019C1/constants'
import { SCL_ERRORS } from '@/v2019C1/errors'
import { getIdentityFields } from '@/v2019C1/extensions/lifecycle/constraints/identity-fields'
import { buildSignalRoleAttributes } from '@/v2019C1/extensions/reference/query/build/build-signal-role-attributes'
import { getPathSegment } from '@/v2019C1/extensions/reference/query/build/path-segment'
import { collectWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry'
import { parsePathSegments } from '@/v2019C1/extensions/reference/query/resolve/parse-path'
import { parseQualifier } from '@/v2019C1/extensions/reference/query/resolve/resolve-reference-path'
import { readAttribute } from '@/v2019C1/helpers'
import { namesGroundedNode } from '@/v2019C1/helpers/grounded-node'
import { createSclImportSessionWith } from '@/v2019C1/hooks/io/io-hooks'
import { pathEdits } from '@/v2019C1/hooks/shared/path-edits'
import { PATH_PAIRS_BY_TAG } from '@/v2019C1/hooks/shared/path-references.constants'
import {
	hasAttributeChange,
	updatedOperation,
	withAttributeValues,
} from '@/v2019C1/hooks/shared/record-ops'

import type { ImportedResolution, PathCandidate, TouchedNames } from './path-references.types'
import type { RecordChange } from './tuple-references.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { SclImportDiagnostic } from '@/v2019C1/errors'
import type { ReferencePair } from '@/v2019C1/extensions/reference'
import type { CollectedWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord, RecordPatch } from '@dialecte/core'

/**
 * Give the path references the commit leaves without a uuid, or with a path its update could not resolve, the uuid of
 * the element their path names, resolved as the import resolves them (one rule: the import's session, fed the
 * document): a reference created, or whose path changed, with no uuid; one whose path edit named nothing when it was
 * made (its uuid held: the element may come later in the transaction); one with no uuid the transaction did not write,
 * when it creates or renames an element. Resolved, the uuid and the path in its standard form are written, with what
 * the reference writes from it; a reference holding a uuid whose path still names nothing (or several elements)
 * refuses the commit (`REFERENCE_NAMES_UNRESOLVED`); one with no uuid stays as written. Nothing is read when no such
 * reference and no created or renamed element (nor any element given as one, `targetRoots`) exist; else each path referrer tag once for the waiting ones (kept when a segment of their path is a name the transaction gave), and the
 * whole document once, only when a reference is to be resolved (none when the caller gives it, `document`).
 */
export async function writePathReferencesAtCommit(params: {
	operations: ReadonlyArray<Scl.Operation>
	query: Core.Query<Config>
	/** The records the commit's earlier steps write, read instead of the staged state. */
	pending: ReadonlyMap<string, AnyRawRecord>
	/**
	 * Elements the caller counts as created or renamed though no operation of the commit creates or renames them (the
	 * roots of a moved subtree): the references waiting for a path are read as for a created element.
	 */
	targetRoots?: ReadonlySet<string>
	/** The whole document, when the caller read it already (with its ancestries): not read again. */
	document?: CollectedWithAncestry
}): Promise<Scl.Operation[]> {
	const { operations, query, pending, targetRoots = new Set<string>(), document } = params
	const changes = foldChanges({ operations, pending })
	const written = [...changes.values()].flatMap((change) => writtenCandidate({ change }))
	const edited = [...pathEdits({ query }).keys()].flatMap((id) =>
		editedCandidate({ change: changes.get(id) }),
	)
	const touched =
		targetRoots.size > 0 ? { every: true, names: new Set<string>() } : touchedNames({ changes })
	const waiting =
		touched.every || touched.names.size > 0
			? (await readTags({ query, tags: [...PATH_PAIRS_BY_TAG.keys()] })).flatMap((record) =>
					changes.has(record.id)
						? []
						: uuidlessCandidate({ record: pending.get(record.id) ?? record, touched }),
				)
			: []
	// a later list wins for a record: an edited path holds its uuid
	const candidates = new Map(
		[...waiting, ...written, ...edited].map((candidate): [string, PathCandidate] => [
			candidate.record.id,
			candidate,
		]),
	)
	if (candidates.size === 0) return []
	const resolved = await resolveAsImported({ query, candidates, document })
	const writes = [...candidates.values()].flatMap((candidate) =>
		writeOf({
			candidate,
			patch: resolved.patches.get(candidate.record.id),
			diagnostics: resolved.diagnostics.get(candidate.record.id) ?? [],
		}),
	)
	return [...writes, ...(await signalRolesFollowing({ query, writes }))]
}

/**
 * The signal role references below each FunctionRef the commit retargets, their paths written again from the function
 * it names now (they start there).
 */
async function signalRolesFollowing(params: {
	query: Core.Query<Config>
	writes: readonly Scl.Operation[]
}): Promise<Scl.Operation[]> {
	const operations: Scl.Operation[] = []
	for (const operation of params.writes) {
		if (operation.status === 'deleted' || operation.newRecord.tagName !== 'FunctionRef') continue
		const { newRecord } = operation
		const rebuilt = await buildSignalRoleAttributes(params.query, {
			functionRef: { tagName: newRecord.tagName, id: newRecord.id } as Scl.Ref<Scl.ElementsOf>,
			written: newRecord,
		})
		for (const { record, values } of rebuilt) {
			const raw = toRawRecord(record)
			const attributes = withAttributeValues(raw.attributes, values)
			if (attributes !== raw.attributes) operations.push(updatedOperation(raw, attributes))
		}
	}
	return operations
}

/** A path reference the transaction created, or whose path it changed, with no uuid for that path: to fill. */
function writtenCandidate(params: { change: RecordChange }): PathCandidate[] {
	const { change } = params
	const { before, after } = change
	const pairs = (PATH_PAIRS_BY_TAG.get(after.tagName) ?? []).filter((pair) => {
		const changed =
			!before ||
			hasAttributeChange({
				oldRecord: before as Scl.RawRecord<Scl.ElementsOf>,
				newRecord: after as Scl.RawRecord<Scl.ElementsOf>,
				names: [pair.attribute.path],
			})
		return changed && isUuidless({ record: after, pair })
	})
	return pairs.length > 0 ? [{ record: after, pairs, holdsUuid: false }] : []
}

/** A path reference holding a uuid whose path the transaction edited: to resolve, or refuse. */
function editedCandidate(params: { change: RecordChange | undefined }): PathCandidate[] {
	const { change } = params
	if (!change?.before) return []
	const { before, after } = change
	const pairs = (PATH_PAIRS_BY_TAG.get(after.tagName) ?? []).filter(
		(pair) =>
			readAttribute({ record: after, name: pair.attribute.path, defaults: 'none' }) !== '' &&
			readAttribute({ record: after, name: pair.attribute.uuid, defaults: 'none' }) !== '' &&
			hasAttributeChange({
				oldRecord: before as Scl.RawRecord<Scl.ElementsOf>,
				newRecord: after as Scl.RawRecord<Scl.ElementsOf>,
				names: [pair.attribute.path],
			}),
	)
	return pairs.length > 0 ? [{ record: after, pairs, holdsUuid: true }] : []
}

/**
 * A path reference with a path and no uuid the transaction did not write: to fill, when a segment of its path is a name
 * the transaction gave (it may name something now).
 */
function uuidlessCandidate(params: {
	record: AnyRawRecord
	touched: TouchedNames
}): PathCandidate[] {
	const { record, touched } = params
	const pairs = (PATH_PAIRS_BY_TAG.get(record.tagName) ?? []).filter(
		(pair) =>
			isUuidless({ record, pair }) &&
			(touched.every ||
				parsePathSegments(
					readAttribute({ record, name: pair.attribute.path, defaults: 'none' }),
				).some(({ segment }) => touched.names.has(segment))),
	)
	return pairs.length > 0 ? [{ record, pairs, holdsUuid: false }] : []
}

/**
 * Whether a pair of a reference has a path and no uuid, one that may name an element: not the grounded node, which no
 * file holds (as on import).
 */
function isUuidless(params: { record: AnyRawRecord; pair: ReferencePair }): boolean {
	const { record, pair } = params
	const path = readAttribute({ record, name: pair.attribute.path, defaults: 'none' })
	return (
		path !== '' &&
		readAttribute({ record, name: pair.attribute.uuid, defaults: 'none' }) === '' &&
		!namesGroundedNode({ targets: pair.target, path })
	)
}

/**
 * The path segment names the transaction gave: those of the elements it created a path may name, and of those it
 * renamed (an element of a path, or above it). Every name counts (`every`) for an element whose segment cannot be read
 * from its own record: an LNode bound to an IED is named by its specification naming, which a change of that naming may
 * rename.
 */
function touchedNames(params: { changes: ReadonlyMap<string, RecordChange> }): TouchedNames {
	const names = new Set<string>()
	for (const { before, after } of params.changes.values()) {
		const touched = before
			? hasAttributeChange({
					oldRecord: before as Scl.RawRecord<Scl.ElementsOf>,
					newRecord: after as Scl.RawRecord<Scl.ElementsOf>,
					names: [...getIdentityFields(after.tagName)],
				})
			: TARGET_ELEMENT_TYPES.has(after.tagName)
		// a specification naming names the LNode it is in: any of its changes may rename that LNode
		if (after.tagName === 'LNodeSpecNaming') return { every: true, names }
		if (!touched) continue
		const segment = getPathSegment(after)?.segment
		if (!segment || isBoundLNode({ record: after })) return { every: true, names }
		// a signal's name may hold dots: each of its parts is a segment of a path naming it
		for (const part of parsePathSegments(segment)) names.add(part.segment)
	}
	return { every: false, names }
}

/** Whether a record is an LNode bound to an IED: a path names it by its specification naming. */
function isBoundLNode(params: { record: AnyRawRecord }): boolean {
	const { record } = params
	if (record.tagName !== 'LNode') return false
	const iedName = readAttribute({ record, name: 'iedName', defaults: 'none' })
	return iedName !== '' && iedName !== 'None'
}

/**
 * The import's patches for the candidates, and what it said about each: the whole document read once, every record
 * handed to an import session as the import hands it, a candidate holding a uuid without what it resolves anew (its
 * uuid, and the data names beside it when its path names other data: `withheldOf`), its path written in its standard
 * form once resolved.
 */
async function resolveAsImported(params: {
	query: Core.Query<Config>
	candidates: ReadonlyMap<string, PathCandidate>
	document: CollectedWithAncestry | undefined
}): Promise<ImportedResolution> {
	const { query, candidates } = params
	const document = params.document ?? (await collectWithAncestry(query, {}))
	const edited = [...candidates.values()].filter((candidate) => candidate.holdsUuid)
	const session = createSclImportSessionWith({
		standardize: new Set(edited.map((candidate) => candidate.record.id)),
	})
	for (const record of document.records) {
		const candidate = candidates.get(record.id)
		session.beforeImportRecord?.({
			record: candidate ? withoutWithheld({ candidate }) : record,
			ancestry: document.ancestryOf(record.id),
		})
	}
	const { updates = [], diagnostics = [] } = await session.afterImport()
	// one patch per pair the session resolved: merged, per reference
	const patches = new Map<string, RecordPatch>()
	for (const patch of updates) {
		if (!candidates.has(patch.recordId)) continue
		const merged = patches.get(patch.recordId)
		patches.set(
			patch.recordId,
			merged
				? {
						recordId: patch.recordId,
						attributes: [...(merged.attributes ?? []), ...(patch.attributes ?? [])],
						removeAttributes: [
							...(merged.removeAttributes ?? []),
							...(patch.removeAttributes ?? []),
						],
					}
				: patch,
		)
	}
	const said = new Map<string, SclImportDiagnostic[]>()
	for (const diagnostic of diagnostics) {
		const id = diagnostic.ref?.id
		if (id === undefined || !candidates.has(id)) continue
		said.set(id, [...(said.get(id) ?? []), diagnostic])
	}
	return { patches, diagnostics: said }
}

/** A candidate as the session reads it: what it resolves anew left out (`withheldOf`). */
function withoutWithheld(params: { candidate: PathCandidate }): AnyRawRecord {
	const { record } = params.candidate
	const withheld = new Set(withheldOf(params))
	if (withheld.size === 0) return record
	return {
		...record,
		attributes: record.attributes.filter((attribute) => !withheld.has(attribute.name)),
	}
}

/**
 * What a candidate holding a uuid resolves anew from its edited path: the uuid of each pair, and the data names beside
 * it (its companions) when the path names other data than they hold, split again as the import splits a path.
 */
function withheldOf(params: { candidate: PathCandidate }): string[] {
	const { record, pairs, holdsUuid } = params.candidate
	if (!holdsUuid) return []
	return pairs.flatMap((pair) => {
		const companions = pair.companions.map((companion) => companion.name)
		const qualifier = dataPathOf({ record, pair })
		const held = companions
			.map((name) => readAttribute({ record, name, defaults: 'none' }))
			.filter((value) => value !== '')
			.join('.')
		return qualifier && qualifier !== held
			? [pair.attribute.uuid, ...companions]
			: [pair.attribute.uuid]
	})
}

/** The data a pair's path names after the element (`Pos.stVal`), none when it names an element only. */
function dataPathOf(params: { record: AnyRawRecord; pair: ReferencePair }): string | undefined {
	const { record, pair } = params
	const path = readAttribute({ record, name: pair.attribute.path, defaults: 'none' })
	return path
		? parseQualifier({ pair, pathAttribute: pair.attribute.path, pathValue: path }) || undefined
		: undefined
}

/**
 * The update a candidate's patch gives: resolved (its pair's uuid set), the patch written, what it withheld and the
 * patch does not set removed; else, for a reference holding a uuid, the commit refused (its path names no element,
 * several, or data its element's type does not hold); else nothing.
 */
function writeOf(params: {
	candidate: PathCandidate
	patch: RecordPatch | undefined
	diagnostics: readonly SclImportDiagnostic[]
}): Scl.Operation[] {
	const { candidate, patch, diagnostics } = params
	const { record, pairs, holdsUuid } = candidate
	const set = new Map(
		(patch?.attributes ?? []).map((attribute) => [attribute.name, attribute.value]),
	)
	const unresolved = pairs.filter((pair) => !set.has(pair.attribute.uuid))
	if (holdsUuid && unresolved.length > 0) refuse({ record, pair: unresolved[0], diagnostics })
	if (!patch || unresolved.length === pairs.length) return []
	const removed = new Set([
		...(patch.removeAttributes ?? []),
		...withheldOf({ candidate }).filter((name) => !set.has(name)),
	])
	const attributes = [
		...record.attributes.filter(
			(attribute) => !set.has(attribute.name) && !removed.has(attribute.name),
		),
		...[...set].map(([name, value]) => ({ name, value })),
	]
	return [updatedOperation(record as Scl.RawRecord<Scl.ElementsOf>, attributes)]
}

/**
 * Refuse the commit for a reference holding a uuid whose edited path does not resolve: it names no element, several
 * (a path several elements hold), or data its element's type does not hold, or an element of no type to split its data
 * path by (`dataPath`, and `untyped` then).
 */
function refuse(params: {
	record: AnyRawRecord
	pair: ReferencePair
	diagnostics: readonly SclImportDiagnostic[]
}): never {
	const { record, pair, diagnostics } = params
	const said = diagnostics.find((diagnostic) => diagnostic.ref?.attribute === pair.attribute.path)
	const address = readAttribute({ record, name: pair.attribute.path, defaults: 'none' })
	const several = said?.code === 'ambiguous-reference'
	const notSplit = said?.code === 'data-path-not-split' ? said : undefined
	const dataPath = notSplit ? dataPathOf({ record, pair }) : undefined
	const untyped = notSplit?.meta.untyped === true
	return throwDialecteError(SCL_ERRORS.REFERENCE_NAMES_UNRESOLVED, {
		meta: {
			reference: { tagName: record.tagName, id: record.id },
			uuidAttribute: pair.attribute.uuid,
			address,
			resolved: several ? 'several' : 'none',
			...(dataPath ? { dataPath } : {}),
			...(untyped ? { untyped } : {}),
		},
		detail: `the path of ${record.tagName} "${record.id}" names ${namedOf({ several, dataPath, untyped })} (${address}); its ${pair.attribute.uuid} is kept: point the path at one element, or remove it to unbind`,
	})
}

/** What an unresolved edited path names, in the words of its refusal. */
function namedOf(params: {
	several: boolean
	dataPath: string | undefined
	untyped: boolean
}): string {
	const { several, dataPath, untyped } = params
	if (several) return 'several elements'
	if (!dataPath) return 'no element'
	return untyped
		? `an element of no type to split its data ${dataPath} by`
		: `an element whose type holds no ${dataPath}`
}
