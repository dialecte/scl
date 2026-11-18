import type { ElementPath } from '../build/path-segment.types'
import type { Scl } from '@/v2019C1/config'
import type { AnyRawRecord } from '@dialecte/core'

export type ResolveResult = {
	record: Scl.TrackedRecord<Scl.ElementsOf>
	qualifier?: string
}

/**
 * Where a signal role's reference starts its path: the function its FunctionRef names, and the base
 * an earlier version wrote the path from.
 */
export type FunctionBases = {
	/** The path of the function the referrer's FunctionRef names. */
	functionPath: ElementPath
	/** The path of the Function (or EqFunction) nearest above it, or at it; `undefined` when none. */
	formerBase: string | undefined
}

/** The bases read for the FunctionRefs of a loop, by what each FunctionRef names (see `functionBasesOfReferrer`). */
export type FunctionBasesCache = Map<string, FunctionBases | undefined>

export type ResolveReferencePathsParams = {
	/** The referrers, as read; one may be given several times. */
	records: readonly Scl.TrackedRecord<Scl.ElementsOf>[]
	/** The path attribute resolved on every record (a record whose tag has no such pair answers `undefined`). */
	pathAttribute: string
}

/** What each record's path names, in input order: as `resolveReferencePath` answers it, `undefined` included. */
export type ResolveReferencePathsResult = (ResolveResult | undefined)[]

/** The reads one resolve asks, merged with the reads the other resolves of the call ask (`batched-reads.ts`). */
export type BatchedReads = ReadVerbs & {
	/** The resolve leaves: the reads still waiting no longer wait for it. */
	leave: () => void
}

/** The reads a resolve asks of the reader. */
export type ReadVerbs = {
	/** `findByAttributes` of one value of one attribute. */
	findByAttribute: (lookup: {
		tagName: string
		attribute: string
		value: string
	}) => Promise<Scl.TrackedRecord<Scl.ElementsOf>[]>
	recordsOfTag: (tagName: string) => Promise<Scl.TrackedRecord<Scl.ElementsOf>[]>
	/** `findAncestors` of the element (read again from its ref), bottom-up. */
	ancestorsOf: (ref: ElementRef) => Promise<Scl.TrackedRecord<Scl.ElementsOf>[]>
	getRecord: (ref: ElementRef) => Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined>
	elementPathOf: (ref: ElementRef) => Promise<ElementPath | null>
	/** `readSpecNamingsById` of the records: the naming of each LNode among them, by LNode id. */
	specNamingsOf: (params: {
		records: readonly AnyRawRecord[]
		/** The tag the records are the whole of, when they are: the read is keyed by it, by their ids otherwise. */
		tagName?: string
	}) => Promise<ReadonlyMap<string, AnyRawRecord>>
}

/** An element as the reader asks for it: its tag and id, read as a ref (checked by the store, not the type). */
export type ElementRef = { readonly tagName: string; readonly id: string }

/** A read waiting to be sent: its kind (reads of one kind are merged), its key (equal reads are one), its waiters. */
export type PendingRead = {
	kind: string
	key: string
	arg: unknown
	waiters: { resolve: (value: unknown) => void; reject: (error: unknown) => void }[]
}

export type ReadOutcome = { ok: true; value: unknown } | { ok: false; error: unknown }

/** Asks one read of the reader: answered from the call's answers, or waiting for the next send. */
export type AskRead = <GenericAnswer>(
	read: Pick<PendingRead, 'kind' | 'key' | 'arg'>,
) => Promise<GenericAnswer>
