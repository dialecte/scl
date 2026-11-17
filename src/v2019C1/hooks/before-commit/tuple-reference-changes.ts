import { IED_TAG } from './tuple-references.constants'

import { toRawRecord } from '@dialecte/core/helpers'

import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { ANCESTORS, PARENTS } from '@/v2019C1/definition/constants.generated'
import { getIdentityFields } from '@/v2019C1/extensions/lifecycle/constraints/identity-fields'
import { REFERENCE_UUIDS_BY_TAG } from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'
import { TUPLE_TARGET_KINDS } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.constants'
import { pairsWrittenWhenSet } from '@/v2019C1/extensions/reference/query/ied-tuple/pairs-written-when-set'
import { readAttribute } from '@/v2019C1/helpers'
import { hasAttributeChange } from '@/v2019C1/hooks/shared/record-ops'

import type {
	PairAction,
	RecordChange,
	ReferenceWork,
	TouchedTargets,
} from './tuple-references.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { TupleReferencePair } from '@/v2019C1/constants'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/** Each record the operations leave, as it was before the transaction (none when created there) and as it is left. */
export function foldChanges(params: {
	operations: ReadonlyArray<Scl.Operation>
	pending: ReadonlyMap<string, AnyRawRecord>
}): Map<string, RecordChange> {
	const { operations, pending } = params
	const changes = new Map<string, RecordChange>()
	for (const operation of operations) {
		if (operation.status === 'deleted') {
			changes.delete(operation.oldRecord.id)
			continue
		}
		const { id } = operation.newRecord
		const known = changes.get(id)
		const before =
			operation.status === 'created' ? undefined : (operation.oldRecord as AnyRawRecord)
		changes.set(id, {
			before: known ? known.before : before,
			after: pending.get(id) ?? (operation.newRecord as AnyRawRecord),
		})
	}
	return changes
}

/** The pairs of a reference the transaction wrote that the commit acts on, and how (see {@link PairAction}). */
export function referrerWork(params: { change: RecordChange }): ReferenceWork[] {
	const { change } = params
	const pairs = writtenPairsOf(change.after.tagName).flatMap((pair) => {
		const action = pairAction({ pair, change })
		return action ? [{ pair, action }] : []
	})
	return pairs.length > 0 ? [{ record: change.after, pairs, fillsFrom: 'any' }] : []
}

/** What the commit does to one pair of a written reference, if anything. */
function pairAction(params: {
	pair: TupleReferencePair
	change: RecordChange
}): PairAction | undefined {
	const { pair, change } = params
	const { before, after } = change
	const uuid = readAttribute({ record: after, name: pair.attribute.uuid, defaults: 'none' })
	const uuidBefore = before
		? readAttribute({ record: before, name: pair.attribute.uuid, defaults: 'none' })
		: undefined
	const namesChanged = !before || pairNamesChanged({ pair, before, after })
	if (!uuid) return namesChanged ? 'fill' : undefined
	if (before && uuid !== uuidBefore) return 'follow-uuid'
	return before && namesChanged ? 'confirm' : undefined
}

/**
 * Whether what a pair names changed between two states of its reference: an attribute naming a part of its target, one
 * standing in for an absent part (`otherwise`), the one saying which kind of target it names (`targetByAttribute`), one
 * deciding whether the pair applies (`onlyWithout`), or, for an IED named by text, the text.
 */
export function pairNamesChanged(params: {
	pair: TupleReferencePair
	before: AnyRawRecord
	after: AnyRawRecord
}): boolean {
	const { pair, before, after } = params
	if ('text' in pair.tuple.ied && before.value.trim() !== after.value.trim()) return true
	return hasAttributeChange({
		oldRecord: before as Scl.RawRecord<Scl.ElementsOf>,
		newRecord: after as Scl.RawRecord<Scl.ElementsOf>,
		names: pairNamingAttributes({ pair, tagName: after.tagName }),
	})
}

/** The attributes saying what a pair names (see {@link pairNamesChanged}). */
function pairNamingAttributes(params: { pair: TupleReferencePair; tagName: string }): string[] {
	const { pair, tagName } = params
	const reference = (REFERENCE_UUIDS_BY_TAG.get(tagName) ?? []).find(
		(candidate) => candidate.uuid === pair.attribute.uuid,
	)
	return [
		...(reference?.names ?? []),
		...Object.values(pair.otherwise ?? {}).flatMap((name) => (name ? [name] : [])),
		...(pair.targetByAttribute ? [pair.targetByAttribute.attribute] : []),
		...(pair.onlyWithout ?? []),
	]
}

/**
 * The tuple targets the transaction created or renamed (its identity fields changed: an IED, an access point, a device,
 * a logical node, a control block): their ids (`roots`, a renamed one standing for everything in it) and the target
 * tags a reference with no uuid may now name by its names (a renamed element's kind and the kinds it may hold).
 */
export function touchedTargets(params: {
	changes: ReadonlyMap<string, RecordChange>
}): TouchedTargets {
	const roots = new Set<string>()
	const tags = new Set<string>()
	for (const { before, after } of params.changes.values()) {
		const isTarget = after.tagName === IED_TAG || TUPLE_TARGET_KINDS.has(after.tagName)
		if (!isTarget) continue
		const renamed =
			before !== undefined &&
			hasAttributeChange({
				oldRecord: before as Scl.RawRecord<Scl.ElementsOf>,
				newRecord: after as Scl.RawRecord<Scl.ElementsOf>,
				names: [...getIdentityFields(after.tagName)],
			})
		if (renamed) for (const tagName of kindsRenamedBy(after.tagName)) tags.add(tagName)
		else if (!before && TUPLE_TARGET_KINDS.has(after.tagName)) tags.add(after.tagName)
		else continue
		roots.add(after.id)
	}
	return { roots, tags }
}

/** The tuple target tags a rename of an element of `tagName` renames: its own, and those an element of it may hold. */
function kindsRenamedBy(tagName: string): string[] {
	const ancestorsByTag = ANCESTORS as Record<string, readonly string[]>
	return [...TUPLE_TARGET_KINDS.keys()].filter(
		(kind) => kind === tagName || (ancestorsByTag[kind] ?? []).includes(tagName),
	)
}

/**
 * The references the transaction did not write that may name a touched target by names only: each referrer tag with a
 * pair pointing at a touched tag read once, its records with no uuid for that pair kept, each filled only by a touched
 * target.
 */
export async function readWaitingReferrers(params: {
	query: Core.Query<Config>
	touched: TouchedTargets
	changes: ReadonlyMap<string, RecordChange>
	pending: ReadonlyMap<string, AnyRawRecord>
}): Promise<ReferenceWork[]> {
	const { query, touched, changes, pending } = params
	const read = await readTags({
		query,
		tags: Object.keys(TUPLE_REFERENCE_PAIRS).filter((tagName) =>
			writtenPairsOf(tagName).some((pair) => pointsAtTouched({ pair, touched })),
		),
	})
	return read.flatMap((found): ReferenceWork[] => {
		if (changes.has(found.id)) return []
		const record = pending.get(found.id) ?? found
		const pairs = writtenPairsOf(record.tagName)
			.filter((pair) => pointsAtTouched({ pair, touched }))
			.filter((pair) => !readAttribute({ record, name: pair.attribute.uuid, defaults: 'none' }))
			.map((pair) => ({ pair, action: 'fill' as const }))
		return pairs.length > 0 ? [{ record, pairs, fillsFrom: 'touched' }] : []
	})
}

/** Whether a pair may point at a tag the transaction touched. */
function pointsAtTouched(params: { pair: TupleReferencePair; touched: TouchedTargets }): boolean {
	const { pair, touched } = params
	return pair.target.some((target) => touched.tags.has(target))
}

/**
 * The references naming their IED by their parent's attribute (a `GSE`, an `SMV` by its `ConnectedAP`'s `iedName`)
 * below a parent whose that attribute the transaction changed, or whose uuid it changed (its names then follow): each
 * pair with a uuid to check against the IED it names now.
 */
export async function readChildrenOfMovedParents(params: {
	query: Core.Query<Config>
	changes: ReadonlyMap<string, RecordChange>
	written: readonly ReferenceWork[]
}): Promise<ReferenceWork[]> {
	const { query, changes, written } = params
	const following = new Set(
		written.flatMap(({ record, pairs }) =>
			pairs.some(({ action }) => action === 'follow-uuid') ? [record.id] : [],
		),
	)
	const childTags = Object.keys(TUPLE_REFERENCE_PAIRS).filter((tagName) =>
		writtenPairsOf(tagName).some((pair) => 'parentAttribute' in pair.tuple.ied),
	)
	const parentTags = new Set(childTags.flatMap((tagName) => parentsOf(tagName)))
	const moved = new Set(
		[...changes.values()].flatMap(({ before, after }) => {
			if (!before || !parentTags.has(after.tagName)) return []
			if (following.has(after.id)) return [after.id]
			const attributes = childTags.flatMap((tagName) => parentAttributesOf(tagName))
			const changed = hasAttributeChange({
				oldRecord: before as Scl.RawRecord<Scl.ElementsOf>,
				newRecord: after as Scl.RawRecord<Scl.ElementsOf>,
				names: attributes,
			})
			return changed ? [after.id] : []
		}),
	)
	if (moved.size === 0) return []
	const read = await readTags({ query, tags: childTags })
	return read.flatMap((record): ReferenceWork[] => {
		if (!record.parent || !moved.has(record.parent.id) || changes.has(record.id)) return []
		const pairs = writtenPairsOf(record.tagName)
			.filter((pair) => 'parentAttribute' in pair.tuple.ied)
			.filter((pair) => readAttribute({ record, name: pair.attribute.uuid, defaults: 'none' }))
			.map((pair) => ({ pair, action: 'confirm' as const }))
		return pairs.length > 0 ? [{ record, pairs, fillsFrom: 'any' }] : []
	})
}

/** The tags an element of `tagName` may sit in. */
function parentsOf(tagName: string): readonly string[] {
	return (PARENTS as Record<string, readonly string[]>)[tagName] ?? []
}

/** The parent attributes a referrer tag names its IED by. */
function parentAttributesOf(tagName: string): string[] {
	return writtenPairsOf(tagName).flatMap((pair) =>
		'parentAttribute' in pair.tuple.ied ? [pair.tuple.ied.parentAttribute] : [],
	)
}

/** The records of some tags, each tag read once. */
export async function readTags(params: {
	query: Core.Query<Config>
	tags: readonly string[]
}): Promise<AnyRawRecord[]> {
	const { query, tags } = params
	const read = await Promise.all(
		tags.map(function readTag(tagName) {
			// dialecte-allow query-in-loop: one read per tag concerned: core reads one tag per call
			return query.getRecordsByTagName(tagName as Scl.ElementsOf)
		}),
	)
	return read.flat().map((found) => toRawRecord(found) as AnyRawRecord)
}

/** The pairs of a referrer tag the commit writes: all but a `followsOnly` one (an LNode's binding). */
export function writtenPairsOf(tagName: string): readonly TupleReferencePair[] {
	return pairsWrittenWhenSet({
		pairs: TUPLE_REFERENCE_PAIRS[tagName as keyof typeof TUPLE_REFERENCE_PAIRS] ?? [],
	})
}
