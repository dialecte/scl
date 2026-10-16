import { updatedOperation } from './record-ops'

import { relativeIedName } from '@/v2019C1/extensions/reference/query/ied-tuple/own-ied-name'
import {
	applyTupleReferenceWrite,
	tupleReferenceWrite,
} from '@/v2019C1/extensions/reference/query/ied-tuple/tuple-reference-write'

import type { Scl, Config } from '@/v2019C1/config'
import type { TupleReferencePair } from '@/v2019C1/constants'
import type { TupleTargetParts } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.types'
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
	const write = tupleReferenceWrite({ record, pairs, partsByUuid, ownIedName })
	if (!write) return undefined

	const written = applyTupleReferenceWrite({ record, write })
	const operation = updatedOperation(record as Scl.RawRecord<Scl.ElementsOf>, written.attributes)
	return {
		...operation,
		newRecord: { ...operation.newRecord, value: written.value },
	} as Scl.Operation
}
