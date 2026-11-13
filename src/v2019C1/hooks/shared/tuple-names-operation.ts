import { updatedOperation } from './record-ops'

import { relativeIedName } from '@/v2019C1/extensions/reference/query/ied-tuple/own-ied-name'
import {
	applyTupleReferenceWrite,
	tupleReferenceWrite,
} from '@/v2019C1/extensions/reference/query/ied-tuple/tuple-reference-write'

import type { Scl, Config } from '@/v2019C1/config'
import type { TupleReferencePair } from '@/v2019C1/constants'
import type {
	TupleReferenceWrite,
	TupleTargetParts,
} from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The update of a tuple reference writing the names of the elements its uuids name (see
 * `tupleReferenceWrite`), `partsByUuid` giving the address parts of each one: its names and, for an
 * `IEDName`, its text, as one update of the record. `undefined` when nothing changes.
 */
export async function tupleNamesOperation(
	query: Core.Query<Config>,
	params: {
		record: AnyRawRecord
		pairs: readonly TupleReferencePair[]
		partsByUuid: ReadonlyMap<string, TupleTargetParts | undefined>
	},
): Promise<Scl.Operation | undefined> {
	const { record, pairs, partsByUuid } = params
	const ownIedName = await relativeIedName(query, { record, pairs })
	return tupleNamesUpdate({ record, pairs, partsByUuid, ownIedName })
}

/**
 * The same update for a caller that holds everything it needs: `ownIedName` is the name of the IED the
 * reference sits in (read only for a reference naming its IED `@`, see `namesRelativeIed`).
 */
export function tupleNamesUpdate(params: {
	record: AnyRawRecord
	pairs: readonly TupleReferencePair[]
	partsByUuid: ReadonlyMap<string, TupleTargetParts | undefined>
	ownIedName: string | undefined
}): Scl.Operation | undefined {
	const { record } = params
	const write = tupleReferenceWrite(params)
	if (!write) return undefined

	return tupleWriteOperation({ record, write })
}

/** The update of a tuple reference writing `write`: its attributes and, for an `IEDName`, its text. */
export function tupleWriteOperation(params: {
	record: AnyRawRecord
	write: TupleReferenceWrite
}): Scl.Operation {
	const { record, write } = params
	const written = applyTupleReferenceWrite({ record, write })
	const operation = updatedOperation(record as Scl.RawRecord<Scl.ElementsOf>, written.attributes)
	return {
		...operation,
		newRecord: { ...operation.newRecord, value: written.value },
	} as Scl.Operation
}
