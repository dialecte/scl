import { buildElementPaths } from '../build/build-element-path'
import { readSpecNamingsById } from '../build/spec-namings'
import { READ_KEY_SEPARATOR } from './batched-reads.constants'

import type { ElementPath } from '../build/path-segment.types'
import type {
	AskRead,
	BatchedReads,
	PendingRead,
	ReadOutcome,
	ReadVerbs,
} from './resolve-reference-path.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * Runs `resolve` for every item at once, each item's reads merged with the reads of the others (`BatchedReads`), and
 * answers one result per item, in input order. Every item runs to its end; then the first error, in input order, is
 * thrown, as a loop over the items would throw it.
 */
export async function runWithBatchedReads<GenericItem, GenericResult>(params: {
	query: Core.Query<Config>
	items: readonly GenericItem[]
	resolve: (reads: BatchedReads, item: GenericItem) => Promise<GenericResult>
}): Promise<GenericResult[]> {
	const { query, items, resolve } = params
	const reads = createBatchedReads({ query, live: items.length })
	const settled = await Promise.allSettled(
		items.map(async function resolveItem(item) {
			try {
				return await resolve(reads, item)
			} finally {
				reads.leave()
			}
		}),
	)
	const failed = settled.find((outcome) => outcome.status === 'rejected')
	if (failed) throw failed.reason
	return settled.map((outcome) => (outcome as PromiseFulfilledResult<GenericResult>).value)
}

/**
 * The reads of `live` resolves run together. Each resolve asks one read at a time; when every resolve still running
 * waits on a read, the reads waiting are sent, merged by kind: a value lookup per tag and attribute in one
 * `findByAttributes` with the values listed, tags each read once, ancestors in one `findAncestorsOfEach`, records in
 * one `getRecords`, element paths in one `buildElementPaths`, spec namings in one `readSpecNamingsById`. An answer is
 * kept for the call only (a read call writes nothing: one call reads one state).
 */
function createBatchedReads(params: { query: Core.Query<Config>; live: number }): BatchedReads {
	const { query } = params
	const state = { live: params.live, waiting: 0, sending: false }
	const answered = new Map<string, unknown>()
	const pending = new Map<string, PendingRead>()

	function ask<GenericAnswer>(
		read: Pick<PendingRead, 'kind' | 'key' | 'arg'>,
	): Promise<GenericAnswer> {
		if (answered.has(read.key)) return Promise.resolve(answered.get(read.key) as GenericAnswer)
		const entry = pending.get(read.key) ?? { ...read, waiters: [] }
		pending.set(read.key, entry)
		const answer = new Promise<GenericAnswer>(function waitForSend(resolve, reject) {
			entry.waiters.push({ resolve: resolve as (value: unknown) => void, reject })
		})
		state.waiting += 1
		sendWhenAllWait()
		return answer
	}

	/** Sends the reads waiting once every resolve still running waits on one: no resolve can ask another before. */
	function sendWhenAllWait(): void {
		if (state.sending || pending.size === 0 || state.waiting < state.live) return
		state.sending = true
		const batch = [...pending.values()]
		pending.clear()
		// a send that throws answers every waiter of its batch with that error: no resolve waits forever
		sendBatch(batch).catch(function rejectBatch(error: unknown) {
			settleBatch({ batch, outcomeOf: () => ({ ok: false, error }) })
		})
	}

	async function sendBatch(batch: PendingRead[]): Promise<void> {
		const outcomes = new Map<string, ReadOutcome>()
		for (const [kind, reads] of groupByKind(batch)) {
			for (const [key, outcome] of await readKind({ query, kind, reads }))
				outcomes.set(key, outcome)
		}
		settleBatch({ batch, outcomeOf: (read) => outcomes.get(read.key) as ReadOutcome })
	}

	/** Answers every waiter of the batch once (a waiter answered is taken off its read), then lets the next send go. */
	function settleBatch(params: {
		batch: readonly PendingRead[]
		outcomeOf: (read: PendingRead) => ReadOutcome
	}): void {
		state.sending = false
		for (const read of params.batch) {
			// dialecte-allow argument-mutation: the waiters of a read are the reader's own state, answered once
			const waiters = read.waiters.splice(0)
			state.waiting -= waiters.length
			const outcome = params.outcomeOf(read)
			if (outcome.ok) answered.set(read.key, outcome.value)
			for (const waiter of waiters) {
				if (outcome.ok) waiter.resolve(outcome.value)
				else waiter.reject(outcome.error)
			}
		}
	}

	return {
		...readVerbs(ask),
		leave: function leave() {
			state.live -= 1
			sendWhenAllWait()
		},
	}
}

/** The reads a resolve asks, each with the kind its reads merge under and the key equal reads share. */
function readVerbs(ask: AskRead): ReadVerbs {
	return {
		findByAttribute: (lookup) =>
			ask<Scl.TrackedRecord<Scl.ElementsOf>[]>({
				kind: keyOf(['value', lookup.tagName, lookup.attribute]),
				key: keyOf(['value', lookup.tagName, lookup.attribute, lookup.value]),
				arg: lookup,
			}),
		recordsOfTag: (tagName) =>
			ask<Scl.TrackedRecord<Scl.ElementsOf>[]>({
				kind: keyOf(['tag', tagName]),
				key: keyOf(['tag', tagName]),
				arg: tagName,
			}),
		ancestorsOf: (ref) =>
			ask<Scl.TrackedRecord<Scl.ElementsOf>[]>({
				kind: 'ancestors',
				key: keyOf(['ancestors', ref.id]),
				arg: { tagName: ref.tagName, id: ref.id },
			}),
		getRecord: (ref) =>
			ask<Scl.TrackedRecord<Scl.ElementsOf> | undefined>({
				kind: 'record',
				key: keyOf(['record', ref.tagName, ref.id]),
				arg: { tagName: ref.tagName, id: ref.id },
			}),
		elementPathOf: (ref) =>
			ask<ElementPath | null>({ kind: 'path', key: keyOf(['path', ref.id]), arg: ref }),
		specNamingsOf: ({ records, tagName }) =>
			ask<ReadonlyMap<string, AnyRawRecord>>({
				kind: 'namings',
				// a whole tag by its name, other records by their ids
				key:
					tagName === undefined
						? keyOf(['namings', ...records.map((record) => record.id)])
						: keyOf(['namings', 'tag', tagName]),
				arg: records,
			}),
	}
}

function groupByKind(batch: readonly PendingRead[]): Map<string, PendingRead[]> {
	const byKind = new Map<string, PendingRead[]>()
	for (const read of batch) {
		const reads = byKind.get(read.kind) ?? []
		reads.push(read)
		byKind.set(read.kind, reads)
	}
	return byKind
}

/** The answer of each read of one kind, by key, from one merged store read; a read refused refuses every read it served. */
async function readKind(params: {
	query: Core.Query<Config>
	kind: string
	reads: readonly PendingRead[]
}): Promise<Map<string, ReadOutcome>> {
	const { query, kind, reads } = params
	try {
		const values = await readMerged({ query, kind, reads })
		return new Map(
			reads.map((read, index) => [read.key, { ok: true, value: values[index] } as ReadOutcome]),
		)
	} catch (error) {
		return new Map(reads.map((read) => [read.key, { ok: false, error } as ReadOutcome]))
	}
}

/** One store read for all the reads of one kind; one answer per read, in order. */
async function readMerged(params: {
	query: Core.Query<Config>
	kind: string
	reads: readonly PendingRead[]
}): Promise<unknown[]> {
	const { query, kind, reads } = params
	const args = reads.map((read) => read.arg)

	if (kind.startsWith(keyOf(['value', '']))) {
		const lookups = args as { tagName: string; attribute: string; value: string }[]
		const { tagName, attribute } = lookups[0]
		const values = lookups.map((lookup) => lookup.value)
		// one value is asked as the single lookup asked it
		const found = await query.findByAttributes({
			tagName: tagName as Scl.ElementsOf,
			attributes: { [attribute]: values.length === 1 ? values[0] : values } as Record<
				string,
				string | string[]
			>,
		})
		// one value: the lookup's answer as it is
		if (values.length === 1) return [found]
		const byValue = groupByAttributeValue({ records: found, attribute })
		return values.map((value) => byValue.get(value) ?? [])
	}
	if (kind.startsWith(keyOf(['tag', '']))) {
		// one tag per kind: its reads share one key
		const records = await query.getRecordsByTagName(args[0] as Scl.ElementsOf)
		return [records]
	}
	if (kind === 'ancestors') {
		return query.findAncestorsOfEach(args as Scl.Ref<Scl.ElementsOf>[])
	}
	if (kind === 'record') {
		return query.getRecords(args as Scl.Ref<Scl.ElementsOf>[])
	}
	if (kind === 'path') {
		return buildElementPaths(query, { refs: args as Scl.Ref<Scl.ElementsOf>[] })
	}
	// namings: one read over every record asked; a naming is read per LNode, so each read takes the whole answer
	const records = uniqueById((args as AnyRawRecord[][]).flat())
	const namings = await readSpecNamingsById(query, { records })
	return reads.map(() => namings)
}

/** The records of each value of `attribute`, in the order found: the answer of a lookup of that value alone. */
function groupByAttributeValue(params: {
	records: readonly Scl.TrackedRecord<Scl.ElementsOf>[]
	attribute: string
}): Map<string, Scl.TrackedRecord<Scl.ElementsOf>[]> {
	const { records, attribute } = params
	const byValue = new Map<string, Scl.TrackedRecord<Scl.ElementsOf>[]>()
	for (const record of records) {
		const value = record.attributes.find((candidate) => candidate.name === attribute)?.value
		if (value === undefined) continue
		const group = byValue.get(value) ?? []
		group.push(record)
		byValue.set(value, group)
	}
	return byValue
}

function uniqueById(records: readonly AnyRawRecord[]): AnyRawRecord[] {
	const seen = new Map<string, AnyRawRecord>()
	for (const record of records) if (!seen.has(record.id)) seen.set(record.id, record)
	return [...seen.values()]
}

/** The kind or key of a read: its parts joined by a separator no part holds. */
function keyOf(parts: readonly string[]): string {
	return parts.join(READ_KEY_SEPARATOR)
}
