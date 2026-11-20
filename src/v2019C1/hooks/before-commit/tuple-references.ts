import { readAncestries } from './tuple-names'
import {
	foldChanges,
	readChildrenOfMovedParents,
	readTags,
	readWaitingReferrers,
	referrerWork,
	touchedTargets,
} from './tuple-reference-changes'
import { OWN_NAMES_BY_PAIR, REQUIRED_OWN_NAMES_BY_PAIR } from './tuple-references.constants'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { ownIedName } from '@/v2019C1/extensions/reference/query/ied-tuple/own-ied-name'
import { referrerTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/referrer-tuple-address'
import { targetKey } from '@/v2019C1/extensions/reference/query/ied-tuple/target-key'
import { targetTagsOf } from '@/v2019C1/extensions/reference/query/ied-tuple/target-tags-of'
import {
	targetTupleParts,
	tupleAddressOf,
} from '@/v2019C1/extensions/reference/query/ied-tuple/target-tuple-address'
import { tuplePairApplies } from '@/v2019C1/extensions/reference/query/ied-tuple/tuple-pair-applies'
import {
	applyTupleReferenceWrite,
	tupleReferenceWrite,
} from '@/v2019C1/extensions/reference/query/ied-tuple/tuple-reference-write'
import { readAttribute } from '@/v2019C1/helpers'
import { tupleWriteOperation } from '@/v2019C1/hooks/shared/tuple-names-operation'
import { resolveTupleUuid } from '@/v2019C1/hooks/shared/tuple-reference-resolve'

import type {
	IndexedTarget,
	ReferenceWork,
	TouchedTargets,
	TupleTargetIndex,
} from './tuple-references.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { TupleReferencePair } from '@/v2019C1/constants'
import type { TupleTargetParts } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * Keep the uuid and the names of every tuple reference in agreement at the commit, whatever the order the transaction
 * wrote them in (an `FCDA` added before the logical node it names). For each pair a reference writes (an LNode's
 * binding, `followsOnly`, never), what it names being read from every attribute saying so (its names, the one standing
 * in for an absent part, the one choosing the kind of target, the parent's IED name for a `GSE` / `SMV`):
 * - a reference created, or whose names changed, with no uuid: the uuid of the one element its names name
 *   ({@link resolveTupleUuid}); none when they name nothing or several. A reference with no uuid the transaction did
 *   not write: the same, when what its names name is an element the transaction created or renamed (or one in it);
 * - a reference whose uuid changed: its names written from the element it names (the uuid wins over names edited with
 *   it);
 * - a reference whose names changed and uuid did not: kept when its names still name what its uuid names, else the
 *   uuid its names give; none when the edit removed every name of the pair (an unbind); else the commit is refused
 *   (`REFERENCE_NAMES_UNRESOLVED`): an edit never drops a uuid. A uuid naming no tuple target of the document (a
 *   template's uuid) is left as written. A pair its reference's other names set aside (an `IEDName`'s access point pair
 *   beside an `ldInst`) is left as it is, whatever changed.
 * A uuid whose names the transaction did not change is kept, even when another element now shares its names. Nothing
 * is read for a transaction writing no tuple reference and creating or renaming no tuple target; else each referrer
 * tag and each target tag concerned once, and the elements above them a level at a time.
 */
export async function writeTupleReferencesAtCommit(params: {
	operations: ReadonlyArray<Scl.Operation>
	query: Core.Query<Config>
	/** The records the commit's earlier steps write, read instead of the staged state. */
	pending: ReadonlyMap<string, AnyRawRecord>
	/** Records already read by an earlier step (the document a move step read), taken instead of read again. */
	held?: ReadonlyMap<string, AnyRawRecord>
}): Promise<Scl.Operation[]> {
	const { operations, query, pending, held } = params
	const changes = foldChanges({ operations, pending })
	const written = [...changes.values()].flatMap((change) => referrerWork({ change }))
	const touched = touchedTargets({ changes })
	const waiting =
		touched.tags.size > 0 ? await readWaitingReferrers({ query, touched, changes, pending }) : []
	const children = await readChildrenOfMovedParents({ query, changes, written })
	// a parent's write first: a child naming its IED by its parent reads the parent as written
	const work = [...written, ...waiting, ...children]
	if (work.length === 0) return []
	const { index, ancestries } = await readTupleTargets({ query, work, held })
	const writtenRecords = new Map<string, AnyRawRecord>()
	return work.flatMap((referrer) => {
		const ancestry = (ancestries.get(referrer.record.id) ?? []).map(
			(ancestor) => writtenRecords.get(ancestor.id) ?? ancestor,
		)
		const operation = composeWrite({ work: referrer, index, ancestry, touched })
		if (operation?.status === 'updated')
			writtenRecords.set(operation.newRecord.id, operation.newRecord as AnyRawRecord)
		return operation ? [operation] : []
	})
}

/**
 * The tuple targets of every tag the work's pairs may point at, each tag read once, indexed by address and by uuid
 * (a target in vendor payload left out), and the elements above the targets and the references, a level at a time,
 * a record already `held` taken from there.
 */
async function readTupleTargets(params: {
	query: Core.Query<Config>
	work: readonly ReferenceWork[]
	held: ReadonlyMap<string, AnyRawRecord> | undefined
}): Promise<{ index: TupleTargetIndex; ancestries: Map<string, AnyRawRecord[]> }> {
	const { query, work, held } = params
	const tags = [...new Set(work.flatMap(({ pairs }) => pairs.flatMap(({ pair }) => pair.target)))]
	const targets = (await readTags({ query, tags })).filter((record) =>
		readAttribute({ record, name: 'uuid', defaults: 'none' }),
	)
	const ancestries = await readAncestries({
		records: [...targets, ...work.map(({ record }) => record)],
		query,
		held,
	})
	return { index: indexTargets({ targets, ancestries }), ancestries }
}

/** The targets by address key and by uuid; an address two targets of one tag share names neither. */
function indexTargets(params: {
	targets: readonly AnyRawRecord[]
	ancestries: ReadonlyMap<string, AnyRawRecord[]>
}): TupleTargetIndex {
	const byAddress = new Map<string, string>()
	const shared = new Set<string>()
	const byUuid = new Map<string, IndexedTarget>()
	for (const record of params.targets) {
		const ancestry = params.ancestries.get(record.id) ?? []
		if (ancestry.some((ancestor) => ancestor.tagName === 'Private')) continue
		const parts = targetTupleParts({ record, ancestry })
		const address = parts ? tupleAddressOf({ parts }) : undefined
		if (!parts || !address) continue
		const uuid = readAttribute({ record, name: 'uuid', defaults: 'none' })
		const key = targetKey({ address, tagName: record.tagName })
		const known = byAddress.get(key)
		if (known !== undefined && known !== uuid) shared.add(key)
		byAddress.set(key, uuid)
		const lineage = new Set([record.id, ...ancestry.map((ancestor) => ancestor.id)])
		byUuid.set(uuid, { tagName: record.tagName, parts, address, lineage })
	}
	for (const key of shared) byAddress.delete(key)
	return { byAddress, byUuid, shared }
}

/** The one update of a reference: the uuids its names give or no longer confirm, then the names its new uuids give. */
function composeWrite(params: {
	work: ReferenceWork
	index: TupleTargetIndex
	ancestry: readonly AnyRawRecord[]
	touched: TouchedTargets
}): Scl.Operation | undefined {
	const { work, index, ancestry, touched } = params
	const { record } = work
	const uuids: Record<string, string | undefined> = {}
	const following: TupleReferencePair[] = []
	const partsByUuid = new Map<string, TupleTargetParts>()
	for (const { pair, action } of work.pairs) {
		const targetTags = targetTagsOf({ pair, record })
		const uuid = readAttribute({ record, name: pair.attribute.uuid, defaults: 'none' })
		const target = uuid ? index.byUuid.get(uuid) : undefined
		// a name the schema requires removed, the uuid kept (an `IEDName`'s `apRef`): written again from the uuid
		if (target && targetTags.includes(target.tagName) && lacksRequiredName({ record, pair })) {
			following.push(pair)
			partsByUuid.set(uuid, target.parts)
			continue
		}
		// a pair its reference's other names set aside (an `IEDName`'s access point pair beside an `ldInst`) names
		// nothing here: its uuid is left as it is
		if (!tuplePairApplies({ record, pair })) continue
		const address = referrerTupleAddress({ pair, record, ancestry })
		const resolved = address
			? resolveTupleUuid({ address, targetTags, targetsByAddress: index.byAddress })
			: undefined
		if (action === 'fill' && resolved && fillAllowed({ work, uuid: resolved, index, touched }))
			uuids[pair.attribute.uuid] = resolved
		if (action === 'follow-uuid' && target && targetTags.includes(target.tagName)) {
			following.push(pair)
			partsByUuid.set(uuid, target.parts)
		}
		const confirmed =
			target !== undefined && target.address === address && targetTags.includes(target.tagName)
		if (action === 'confirm' && target && !confirmed)
			uuids[pair.attribute.uuid] = confirmedUuid({
				record,
				pair,
				address,
				targetTags,
				resolved,
				index,
			})
	}
	return updateOf({ record, uuids, following, partsByUuid, ancestry })
}

/** Whether a reference lacks an own name of a pair the schema requires on it (an `IEDName` with no `apRef`). */
function lacksRequiredName(params: { record: AnyRawRecord; pair: TupleReferencePair }): boolean {
	const { record, pair } = params
	const required = REQUIRED_OWN_NAMES_BY_PAIR.get(record.tagName)?.get(pair.attribute.uuid) ?? []
	return required.some((name) => !readAttribute({ record, name, defaults: 'none' }))
}

/**
 * The uuid of a pair whose own names the transaction changed and no longer name what its uuid names: the one they
 * name now; none when the edit removed every name of the pair (an unbind); else the commit is refused
 * (`REFERENCE_NAMES_UNRESOLVED`): an edit never drops a uuid its names do not let go of.
 */
function confirmedUuid(params: {
	record: AnyRawRecord
	pair: TupleReferencePair
	address: string | undefined
	targetTags: readonly string[]
	resolved: string | undefined
	index: TupleTargetIndex
}): string | undefined {
	const { record, pair, address, targetTags, resolved, index } = params
	if (resolved) return resolved
	const ownNames = OWN_NAMES_BY_PAIR.get(record.tagName)?.get(pair.attribute.uuid) ?? []
	const unbound = ownNames.every((name) => !readAttribute({ record, name, defaults: 'none' }))
	if (unbound) return undefined
	// two tags answering (a report and a GOOSE of one name), or two targets of one tag sharing the address
	const keys = address ? targetTags.map((tagName) => targetKey({ address, tagName })) : []
	const answering = keys.filter((key) => index.byAddress.has(key) || index.shared.has(key))
	const several = answering.length > 1 || keys.some((key) => index.shared.has(key))
	return throwDialecteError(SCL_ERRORS.REFERENCE_NAMES_UNRESOLVED, {
		meta: {
			reference: { tagName: record.tagName, id: record.id },
			uuidAttribute: pair.attribute.uuid,
			address,
			resolved: several ? 'several' : 'none',
		},
		detail: `the names of ${record.tagName} "${record.id}" name ${several ? 'several elements' : 'no element'} (${address ?? 'no whole address'}); its ${pair.attribute.uuid} is kept: point the names at one element, or remove them all to unbind it`,
	})
}

/** Whether a reference may take a uuid its names give: any, or for one the transaction did not write, a touched one. */
function fillAllowed(params: {
	work: ReferenceWork
	uuid: string
	index: TupleTargetIndex
	touched: TouchedTargets
}): boolean {
	const { work, uuid, index, touched } = params
	if (work.fillsFrom === 'any') return true
	const lineage = index.byUuid.get(uuid)?.lineage
	return lineage !== undefined && [...touched.roots].some((root) => lineage.has(root))
}

/** The update writing the uuids, then the names of the pairs following their uuid; none when nothing changes. */
function updateOf(params: {
	record: AnyRawRecord
	uuids: Record<string, string | undefined>
	following: readonly TupleReferencePair[]
	partsByUuid: ReadonlyMap<string, TupleTargetParts>
	ancestry: readonly AnyRawRecord[]
}): Scl.Operation | undefined {
	const { record, uuids, following, partsByUuid, ancestry } = params
	const filled = applyTupleReferenceWrite({
		record,
		write: { attributes: uuids, value: undefined },
	})
	const names =
		following.length > 0
			? tupleReferenceWrite({
					record: filled,
					pairs: following,
					partsByUuid,
					ownIedName: ownIedName({ ancestry }),
				})
			: undefined
	const attributes = { ...uuids, ...names?.attributes }
	if (Object.keys(attributes).length === 0 && names?.value === undefined) return undefined
	return tupleWriteOperation({ record, write: { attributes, value: names?.value } })
}
