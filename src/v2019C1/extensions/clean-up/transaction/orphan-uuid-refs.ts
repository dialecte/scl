import { KEEP_ON_ORPHAN_REFS, REFERENCE_TAGS, UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { readAttribute } from '@/v2019C1/helpers'

import type {
	KnownTarget,
	ReferenceJudgement,
	TargetLookups,
	UuidPair,
} from './orphan-uuid-refs.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Walks every UUID reference pair in the target DB.
 * - Target found → keep as-is
 * - Target absent + keep-on-orphan → clear uuid/path/companion attrs
 * - Target absent + delete-on-orphan → delete record
 *
 * Perf: per reference tag, a target tag is looked up once for the uuids of all its references (those an earlier target
 * tag of their pair did not hold), not once per reference and pair. A write (its hooks may clear, delete or rename)
 * makes what was read before it checked again where it is used: the reference and the targets found read again from
 * the transaction, a uuid found missing looked up again, with the uuids of the references left.
 *
 * @intent clean dangling uuid references after a delete, remove or clear references whose target is gone, fix orphaned references
 */
export async function orphanUuidRefs(tx: Core.Transaction<Config>): Promise<void> {
	for (const refTagName of REFERENCE_TAGS) {
		// dialecte-allow query-in-loop: one read per reference tag, as before: each tag is read after the writes of the tags before it
		const refRecords = await tx.getRecordsByTagName(refTagName)
		await cleanReferencesOfTag(tx, { refTagName, refRecords })
	}
}

// ── Local helpers ───────────────────────────────────────────────────────────

/**
 * Judge and write each reference of one tag in order, on the transaction's state; the write is given the record the
 * tag read answered, as each reference was read.
 */
async function cleanReferencesOfTag(
	tx: Core.Transaction<Config>,
	params: { refTagName: Scl.ElementsOf; refRecords: readonly Scl.TrackedRecord<Scl.ElementsOf>[] },
): Promise<void> {
	const { refTagName, refRecords } = params
	const pairs: readonly UuidPair[] =
		UUID_REFERENCE_PAIRS[refTagName as keyof typeof UUID_REFERENCE_PAIRS]
	const keepOnOrphan = KEEP_ON_ORPHAN_REFS.has(refTagName)
	const lookups = createTargetLookups(tx)

	for (const [index, ref] of refRecords.entries()) {
		// dialecte-allow query-in-loop: after a write only, from the transaction's state (its cache, no store read): a hook may have changed it
		const record = lookups.hasWritten() ? await tx.getRecord(ref) : ref
		if (!record) continue
		const left = refRecords.slice(index)
		const { cleared, deleted } = await judgeReference({
			record,
			pairs,
			keepOnOrphan,
			lookups,
			left,
		})
		const clears = Object.keys(cleared).length > 0
		if (clears) await tx.update(ref, { attributes: cleared })
		if (deleted) await tx.delete(ref)
		if (clears || deleted) lookups.written()
	}
}

/** The attributes of the pairs naming nothing cleared; deleted when every uuid names nothing and the tag does not keep it. */
async function judgeReference(params: {
	record: Scl.TrackedRecord<Scl.ElementsOf>
	pairs: readonly UuidPair[]
	keepOnOrphan: boolean
	lookups: TargetLookups
	left: readonly Scl.TrackedRecord<Scl.ElementsOf>[]
}): Promise<ReferenceJudgement> {
	const { record, pairs, keepOnOrphan, lookups, left } = params
	let hasAnyUuidAttribute = false
	let hasAnyValidRef = false
	const cleared: Record<string, undefined> = {}

	for (const pair of pairs) {
		const uuid = readAttribute({ record, name: pair.attribute.uuid })
		if (!uuid) continue
		hasAnyUuidAttribute = true
		const found = await lookups.isTargetFound({ pair, uuid, left })
		if (found) {
			hasAnyValidRef = true
			continue
		}
		cleared[pair.attribute.uuid] = undefined
		cleared[pair.attribute.path] = undefined
		for (const companion of pair.companions) cleared[companion.name] = undefined
	}

	return { cleared, deleted: hasAnyUuidAttribute && !hasAnyValidRef && !keepOnOrphan }
}

/**
 * The target lookups of one reference tag. A target tag is looked up once for the uuid asked and the uuids the
 * references left carry in the pair, those an earlier target tag of the pair answered missing since the last write
 * and this tag has no answer for (or answered missing before it). An answer found before the last write is read again
 * from the transaction where it is used; one missing is looked up again.
 */
function createTargetLookups(tx: Core.Transaction<Config>): TargetLookups {
	const known = new Map<string, Map<string, KnownTarget>>()
	let writes = 0

	function keep(params: { tagName: string; answers: ReadonlyMap<string, KnownTarget> }): void {
		known.set(params.tagName, new Map([...(known.get(params.tagName) ?? []), ...params.answers]))
	}

	return {
		async isTargetFound({ pair, uuid, left }) {
			for (const [position, tagName] of pair.target.entries()) {
				const answer = answerOf({ known, tagName, uuid })
				const fresh = await freshAnswer(tx, { answer, uuid, writes })
				if (fresh && fresh !== answer) keep({ tagName, answers: new Map([[uuid, fresh]]) })
				if (fresh?.refs.length) return true
				if (fresh) continue
				const asked = collectAsked({
					known,
					tagName,
					uuid,
					pair,
					earlier: pair.target.slice(0, position),
					left,
					writes,
				})
				const answers = await lookUp(tx, { tagName, asked, writes })
				keep({ tagName, answers })
				if (answerOf({ known, tagName, uuid })?.refs.length) return true
			}
			return false
		},
		written() {
			writes++
		},
		hasWritten() {
			return writes > 0
		},
	}
}

/**
 * The answer for a uuid of a tag, fresh: taken since the last write, or found before it and still carrying the uuid in
 * the transaction (read again from it); `undefined` when it must be looked up.
 */
async function freshAnswer(
	tx: Core.Transaction<Config>,
	params: { answer: KnownTarget | undefined; uuid: string; writes: number },
): Promise<KnownTarget | undefined> {
	const { answer, uuid, writes } = params
	if (!answer) return undefined
	if (answer.at === writes) return answer
	if (answer.refs.length === 0) return undefined
	const records = await tx.getRecords([...answer.refs])
	const refs = answer.refs.filter(function stillCarries(_ref, index) {
		const record = records[index]
		return record !== undefined && readAttribute({ record, name: 'uuid' }) === uuid
	})
	return refs.length === 0 ? undefined : { refs, at: writes }
}

/**
 * The uuids to ask a target tag: the one asked, and those the references left carry in the pair that an earlier target
 * tag of the pair answered missing since the last write and this tag has no answer for (or answered missing before it).
 */
function collectAsked(params: {
	known: ReadonlyMap<string, ReadonlyMap<string, KnownTarget>>
	tagName: string
	uuid: string
	pair: UuidPair
	earlier: readonly string[]
	left: readonly Scl.TrackedRecord<Scl.ElementsOf>[]
	writes: number
}): Set<string> {
	const { known, tagName, pair, earlier, left, writes } = params
	const asked = new Set<string>([params.uuid])
	for (const record of left) {
		const uuid = readAttribute({ record, name: pair.attribute.uuid })
		if (!uuid || !needsLookup({ answer: answerOf({ known, tagName, uuid }), writes })) continue
		const missingBefore = earlier.every(function isMissingBefore(earlierTag) {
			return isFreshlyMissing({ answer: answerOf({ known, tagName: earlierTag, uuid }), writes })
		})
		if (missingBefore) asked.add(uuid)
	}
	return asked
}

/**
 * One lookup of a target tag for the uuids asked: each answered with every record carrying it, at this write (the
 * data-model's `lookUpIds` keeps one record per id; a uuid held twice keeps both here, each checked again after a write).
 */
async function lookUp(
	tx: Core.Transaction<Config>,
	params: { tagName: string; asked: ReadonlySet<string>; writes: number },
): Promise<Map<string, KnownTarget>> {
	const { tagName, asked, writes } = params
	const matches = await tx.findByAttributes({
		tagName: tagName as Scl.ElementsOf,
		attributes: { uuid: [...asked] },
	})
	const refsByUuid = groupByUuid(matches)
	return new Map(
		[...asked].map(function answerFor(uuid) {
			return [uuid, { refs: refsByUuid.get(uuid) ?? [], at: writes }] as const
		}),
	)
}

function answerOf(params: {
	known: ReadonlyMap<string, ReadonlyMap<string, KnownTarget>>
	tagName: string
	uuid: string
}): KnownTarget | undefined {
	return params.known.get(params.tagName)?.get(params.uuid)
}

/** Answered missing since the last write. */
function isFreshlyMissing(params: { answer: KnownTarget | undefined; writes: number }): boolean {
	const { answer, writes } = params
	return answer !== undefined && answer.at === writes && answer.refs.length === 0
}

/** Never asked of the tag, or answered missing before the last write. */
function needsLookup(params: { answer: KnownTarget | undefined; writes: number }): boolean {
	const { answer, writes } = params
	return answer === undefined || (answer.at !== writes && answer.refs.length === 0)
}

/** The refs of the records found, by the uuid they carry. */
function groupByUuid(
	matches: readonly Scl.TrackedRecord<Scl.ElementsOf>[],
): Map<string, Scl.Ref<Scl.ElementsOf>[]> {
	const refsByUuid = new Map<string, Scl.Ref<Scl.ElementsOf>[]>()
	for (const match of matches) {
		const uuid = readAttribute({ record: match, name: 'uuid' })
		const ref = { tagName: match.tagName, id: match.id } as Scl.Ref<Scl.ElementsOf>
		refsByUuid.set(uuid, [...(refsByUuid.get(uuid) ?? []), ref])
	}
	return refsByUuid
}
