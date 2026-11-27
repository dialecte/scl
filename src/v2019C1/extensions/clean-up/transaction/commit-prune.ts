import { DATA_TYPE_TAGS } from './commit-prune.constants'

import { throwDialecteError } from '@dialecte/core'
import { toRef } from '@dialecte/core/helpers'

import { buildPathFromAncestry } from '@/v2019C1/extensions/reference/query/build/path-segment'
import { compareDocumentOrder } from '@/v2019C1/extensions/reference/query/find/compare-document-order'
import { readAttribute } from '@/v2019C1/helpers'
import { planCommit } from '@/v2019C1/hooks/before-commit/before-commit'
import { identityOf } from '@/v2019C1/hooks/shared/element-identity'

import type {
	CommitPrune,
	CommitPruneOptions,
	CommitPrunedContainer,
	CommitPrunedType,
} from './commit-prune.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { PrunedContainer } from '@/v2019C1/hooks/before-commit/prune-emptied-containers.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * What the commit of this transaction will prune, before it does, without writing: the commit's own steps run over the
 * operations staged so far. Each container comes in document order with its identity, its parent, the element a
 * reference path names at or above it (`owner`), why it goes, every record it holds (another tool's data included) and
 * what goes with it outside (a data set's control blocks, the references naming it, `cleared` and `revised`); then the
 * types the commit removes as unused with their records, what the commit's moves remove with why each goes, and the
 * LNodes it releases with the binding each had and is left with. Together they name every record the commit removes
 * beyond the transaction's own edits, each once.
 *
 * A preview holds only for the staged state it read (`stagedCount` operations): call it last, after every write, then
 * commit or discard. A step the commit gains later is seen here without a change. A transaction the commit refuses
 * throws the same error; with `{ collect: true }`, every move the commit does not follow (`MOVE_NOT_FOLLOWED`) and every
 * incoherent uuid reference (`REFERENCE_INCOHERENT`) is listed in `refusals` instead, in the order the commit judges
 * them (the commit refuses with the first), and the rest of the preview reads the commit as if they were accepted; every
 * other refusal still throws. The ids of records the commit creates (a `Private` wrapping an element of the extension
 * namespace, on a move or a create) are not part of the preview; the ids of the containers it prunes are stable.
 *
 * @intent preview what the commit will remove, warn before a commit prunes a container, list what a commit deletes beyond the edits
 */
export async function commitPrune(
	tx: Core.Transaction<Config>,
	options: CommitPruneOptions = {},
): Promise<CommitPrune> {
	const operations = tx.getStagedOperations()
	const planned = await planCommit({ operations, query: tx, collect: options.collect ?? false })
	const containers = await describeContainers(tx, { containers: planned.containers })
	return {
		stagedCount: operations.length,
		containers,
		types: describeTypes({ operations: planned.stagedBy.get('unusedTypes') ?? [] }),
		moves: planned.moveRemovals,
		released: planned.released,
		refusals: planned.refusals,
		normalised: planned.normalised,
	}
}

/** Each container with its identity, parent, owner and holds, in document order: its records read once. */
async function describeContainers(
	tx: Core.Transaction<Config>,
	params: { containers: readonly PrunedContainer[] },
): Promise<CommitPrunedContainer[]> {
	const { containers } = params
	if (containers.length === 0) return []
	const refs = containers.map((container) => toRef(container.element) as Scl.Ref<Scl.ElementsOf>)
	const read = await tx.getRecords(refs)
	const records = read.flatMap((record) => (record ? [record] : []))
	if (records.length !== containers.length) {
		return throwDialecteError('ASSERTION_FAILED', {
			detail: 'commitPrune: a container the commit prunes is not in the document',
		})
	}
	// the parent of a pruned container is read from its chain, a Private included
	const ancestries = await tx.findAncestorsOfEach(records, { order: 'top-down', unwrap: [] })
	const described = containers.map(function describeContainer(container, index) {
		const record = records[index]
		const ancestry = ancestries[index] ?? []
		const path = buildPathFromAncestry({ record, ancestry })
		const owner = path?.segments.at(-1)?.ref
		const parentRecord = ancestry.at(-1)
		const parentName = parentRecord ? identityOf({ record: parentRecord }).name : undefined
		const entry: CommitPrunedContainer = {
			element: container.element,
			identity: identityOf({ record }),
			parent: { ...container.parent, ...(parentName ? { name: parentName } : {}) },
			...(path && owner?.id
				? { owner: { tagName: owner.tagName as Scl.ElementsOf, id: owner.id, path: path.path } }
				: {}),
			reason: container.reason,
			holds: inDocumentOrder({ root: record, byId: recordsById(container.within) }),
			goesWith: container.goesWith,
		}
		return { line: [...ancestry, record], entry }
	})
	return described
		.sort((first, second) => compareDocumentOrder({ first: first.line, second: second.line }))
		.map(({ entry }) => entry)
}

/** Records by id. */
function recordsById(
	records: readonly Scl.RawRecord<Scl.ElementsOf>[],
): ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>> {
	return new Map(records.map((record) => [record.id, record]))
}

/** The records of `byId` under `root`, depth first in their parents' child order. */
function inDocumentOrder(params: {
	root: AnyRawRecord
	byId: ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>>
}): Scl.RawRecord<Scl.ElementsOf>[] {
	const { byId } = params
	const ordered: Scl.RawRecord<Scl.ElementsOf>[] = []
	const pending = [...params.root.children].reverse()
	while (pending.length > 0) {
		const next = pending.pop()
		const record = next ? byId.get(next.id) : undefined
		if (!record) continue
		ordered.push(record)
		pending.push(...[...record.children].reverse())
	}
	return ordered
}

/** The types the commit deletes as unused, each with the records it holds, from that step's deletes. */
function describeTypes(params: { operations: readonly Scl.Operation[] }): CommitPrunedType[] {
	const deleted = params.operations.flatMap((operation) =>
		operation.status === 'deleted' ? [operation.oldRecord] : [],
	)
	const byId = recordsById(deleted)
	return deleted
		.filter((record) => DATA_TYPE_TAGS.has(record.tagName))
		.map(function describeType(type): CommitPrunedType {
			const id = readAttribute({
				record: type,
				name: 'id',
				defaults: 'none',
				fullObject: true,
			})?.value
			return {
				element: { tagName: type.tagName, id: type.id },
				identity: id ? { id } : {},
				holds: inDocumentOrder({ root: type, byId }),
			}
		})
}
