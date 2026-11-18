import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'

import type { ResolveResult } from '../resolve-reference-path.types'
import type { Answer, Reads, Referrer } from './reference-paths.types'
import type { Scl } from '@/v2019C1/config'

/** The fixtures hold paths naming nothing (a stale uuid, a Bay that is not there): what is tested. */
export const NAMING_NOTHING = 'paths naming nothing are resolved to undefined'

/** The store calls that read records, counted by the dev perf counters. */
const STORE_READS = [
	'core::store::get',
	'core::store::getMany',
	'core::store::getByTagName',
	'core::store::getByAttributes',
	'core::store::getByDocumentId',
] as const

/** The records the store calls move, counted by the dev perf counters. */
const RECORDS_MOVED = [
	'core::store::records.get',
	'core::store::records.getMany',
	'core::store::records.getByTagName',
	'core::store::records.getByAttributes',
	'core::store::records.getByDocumentId',
] as const

/** The store reads and records moved of `act`, from the counters of `perf`. */
export async function countReads(params: {
	perf: { reset: () => void; report: () => Record<string, { count?: number }> }
	act: () => Promise<unknown>
}): Promise<Reads> {
	const { perf, act } = params
	perf.reset()
	await act()
	const report = perf.report()
	return {
		storeReads: STORE_READS.reduce((sum, key) => sum + (report[key]?.count ?? 0), 0),
		recordsMoved: RECORDS_MOVED.reduce((sum, key) => sum + (report[key]?.count ?? 0), 0),
	}
}

/** The referrers read, as stored or, `byPath`, without the uuid attribute of each pair of their tag. */
export async function readReferrers(params: {
	query: Scl.Query | Scl.Transaction
	refs: readonly Scl.Ref<Scl.ElementsOf>[]
	byPath: boolean
}): Promise<Scl.TrackedRecord<Scl.ElementsOf>[]> {
	const { query, refs, byPath } = params
	const read = await query.getRecords([...refs])
	const found = read.filter((record): record is Scl.TrackedRecord<Scl.ElementsOf> => !!record)
	if (found.length !== refs.length) throw new Error('a referrer of the case is not in the fixture')
	return byPath ? found.map(withoutUuidCompanions) : found
}

function withoutUuidCompanions(
	record: Scl.TrackedRecord<Scl.ElementsOf>,
): Scl.TrackedRecord<Scl.ElementsOf> {
	const pairs = (
		UUID_REFERENCE_PAIRS as Record<string, readonly { attribute: { uuid: string } }[]>
	)[record.tagName]
	const uuids = new Set((pairs ?? []).map((pair) => pair.attribute.uuid))
	return {
		...record,
		attributes: record.attributes.filter((attribute) => !uuids.has(attribute.name)),
	}
}

export function answerOf(result: ResolveResult | undefined): Answer {
	if (!result) return undefined
	const { tagName, id } = result.record
	return result.qualifier === undefined
		? { tagName, id }
		: { tagName, id, qualifier: result.qualifier }
}

/** The answers of the referrers, `created` read as the FunctionalVariant `stageWrites` created. */
export function expectedOf(params: { referrers: readonly Referrer[]; created?: string }): Answer[] {
	return params.referrers.map(({ answer }) =>
		answer === 'created' ? { tagName: 'FunctionalVariant', id: params.created ?? '' } : answer,
	)
}

/**
 * The writes of the staged cases on the mixed fixture: the Bay B1 renamed B9 (its paths name nothing), a SourceRef's
 * path changed to the Bay B2, the LNode XCBR1 of B1 deleted (its uuid names nothing), a GGIO twin renamed, a
 * FunctionalVariant `Slow` created in A1. Answers the id created.
 */
export async function stageWrites(tx: Scl.Transaction): Promise<string> {
	await tx.update({ tagName: 'Bay', id: 'bay-1' }, { attributes: { name: 'B9' } })
	await tx.update(
		{ tagName: 'SourceRef', id: 'sr-path' },
		{ attributes: { source: 'S1/V1/B2/F1/XCBR1.Pos' } },
	)
	await tx.delete({ tagName: 'LNode', id: 'ln-xcbr' })
	await tx.update({ tagName: 'LNode', id: 'ln-ggio-a' }, { attributes: { lnInst: '2' } })
	const created = await tx.addChild(
		{ tagName: 'FunctionalVariantGroup', id: 'fvg-1' },
		{ tagName: 'FunctionalVariant', attributes: { name: 'Slow' } },
	)
	return created.id ?? ''
}
