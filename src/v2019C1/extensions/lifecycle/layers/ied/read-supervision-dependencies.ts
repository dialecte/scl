import { extractionConfRev } from './extraction-conf-rev'
import { isNativeRecord } from './is-native-record'

import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { collectWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry'
import { referrerTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/referrer-tuple-address'
import { targetTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/target-tuple-address'
import { readAttribute } from '@/v2019C1/helpers'
import { findDataSetUsers } from '@/v2019C1/hooks/shared/find-data-set-users'

import type {
	AffectedDataSet,
	OmittedLogicalNodes,
	SupervisionDependencyPlan,
} from './supervision-dependencies.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { CollectedWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/** Preflight the surviving DataSets and controls depending on omitted supervision, without changing either document. */
export async function readSupervisionDependencies(
	query: Core.Query<Config>,
	params: { iedRef: Scl.Ref<'IED'>; leaveOut: ReadonlySet<string> },
): Promise<SupervisionDependencyPlan> {
	const { iedRef, leaveOut } = params
	const collected = await collectWithAncestry(query, { root: iedRef })
	const nativeRecords = collected.records.filter(isNativeRecord)
	const omitted = readOmittedLogicalNodes({ nativeRecords, leaveOut, collected })
	const surviving = nativeRecords.filter(
		(record) => !isLeftOut({ id: record.id, leaveOut, collected }),
	)
	const removedByDataSet = selectFcdasNamingOmitted({ surviving, omitted, collected })
	const affected = describeAffectedDataSets({ surviving, removedByDataSet })
	const consumers = await planDataSetConsumers(query, { affected, leaveOut, collected })
	return {
		fcdas: [...removedByDataSet.values()].flatMap((removed) =>
			[...removed].map((id) => ({ tagName: 'FCDA', id })),
		),
		emptyDataSets: dataSetRefs({ affected, outcome: 'empty' }),
		payloadDataSets: dataSetRefs({ affected, outcome: 'payload' }),
		consumers,
	}
}

/** A record left out by the selection, itself or through one of its ancestors. */
function isLeftOut(params: {
	id: string
	leaveOut: ReadonlySet<string>
	collected: CollectedWithAncestry
}): boolean {
	const { id, leaveOut, collected } = params
	return leaveOut.has(id) || collected.ancestryOf(id).some((ancestor) => leaveOut.has(ancestor.id))
}

/** What the left-out logical nodes are named by: their uuids and their tuple addresses. */
function readOmittedLogicalNodes(params: {
	nativeRecords: readonly AnyRawRecord[]
	leaveOut: ReadonlySet<string>
	collected: CollectedWithAncestry
}): OmittedLogicalNodes {
	const { nativeRecords, leaveOut, collected } = params
	const uuids = new Set<string>()
	const addresses = new Set<string>()
	for (const record of nativeRecords) {
		if (record.tagName !== 'LN' || !leaveOut.has(record.id)) continue
		const uuid = readAttribute({ record, name: 'uuid', defaults: 'none', fullObject: true })?.value
		if (uuid) uuids.add(uuid)
		const address = targetTupleAddress({ record, ancestry: collected.ancestryOf(record.id) })
		if (address) addresses.add(address)
	}
	return { uuids, addresses }
}

/** The surviving DataSet members naming a left-out logical node, by uuid when they hold one, by tuple otherwise. */
function selectFcdasNamingOmitted(params: {
	surviving: readonly AnyRawRecord[]
	omitted: OmittedLogicalNodes
	collected: CollectedWithAncestry
}): ReadonlyMap<string, ReadonlySet<string>> {
	const { surviving, omitted, collected } = params
	const removedByDataSet = new Map<string, Set<string>>()
	const [pair] = TUPLE_REFERENCE_PAIRS.FCDA
	for (const record of surviving) {
		if (record.tagName !== 'FCDA' || record.parent?.tagName !== 'DataSet') continue
		const twin = readAttribute({
			record,
			name: pair.attribute.uuid,
			defaults: 'none',
			fullObject: true,
		})
		const address =
			twin === undefined
				? referrerTupleAddress({ pair, record, ancestry: collected.ancestryOf(record.id) })
				: undefined
		const namesOmitted =
			twin !== undefined
				? omitted.uuids.has(twin.value)
				: address !== undefined && omitted.addresses.has(address)
		if (!namesOmitted) continue
		const removed = removedByDataSet.get(record.parent.id) ?? new Set<string>()
		removed.add(record.id)
		removedByDataSet.set(record.parent.id, removed)
	}
	return removedByDataSet
}

/** What losing those members does to each surviving DataSet. */
function describeAffectedDataSets(params: {
	surviving: readonly AnyRawRecord[]
	removedByDataSet: ReadonlyMap<string, ReadonlySet<string>>
}): AffectedDataSet[] {
	const { surviving, removedByDataSet } = params
	return surviving.flatMap((dataSet): AffectedDataSet[] => {
		const removed = removedByDataSet.get(dataSet.id)
		if (dataSet.tagName !== 'DataSet' || !removed) return []
		const remains = surviving.some(
			(record) =>
				record.tagName === 'FCDA' && record.parent?.id === dataSet.id && !removed.has(record.id),
		)
		if (remains) return [{ id: dataSet.id, outcome: 'kept' }]
		const holdsMore = dataSet.value || dataSet.children.some((child) => !removed.has(child.id))
		return [{ id: dataSet.id, outcome: holdsMore ? 'payload' : 'empty' }]
	})
}

function dataSetRefs(params: {
	affected: readonly AffectedDataSet[]
	outcome: AffectedDataSet['outcome']
}): Scl.Ref<'DataSet'>[] {
	return params.affected
		.filter(({ outcome }) => outcome === params.outcome)
		.map(({ id }) => ({ tagName: 'DataSet', id }))
}

/** The controls of the surviving DataSets to bring in line, each control once. */
async function planDataSetConsumers(
	query: Core.Query<Config>,
	params: {
		affected: readonly AffectedDataSet[]
		leaveOut: ReadonlySet<string>
		collected: CollectedWithAncestry
	},
): Promise<SupervisionDependencyPlan['consumers']> {
	const { affected, leaveOut, collected } = params
	const planned = new Map<string, SupervisionDependencyPlan['consumers'][number]>()
	for (const dataSet of affected) {
		const consumers = await findDataSetUsers(query, {
			dataSet: { tagName: 'DataSet', id: dataSet.id },
		})
		for (const consumer of consumers) {
			if (planned.has(consumer.id)) continue
			if (isLeftOut({ id: consumer.id, leaveOut, collected })) continue
			const plan = planConsumer({ consumer, remains: dataSet.outcome === 'kept' })
			if (plan) planned.set(consumer.id, plan)
		}
	}
	return [...planned.values()]
}

/** A disabled log, or a control whose revision moves past the extraction; other users of a DataSet are not controls. */
function planConsumer(params: {
	consumer: Scl.TrackedRecord<Scl.ElementsOf>
	remains: boolean
}): SupervisionDependencyPlan['consumers'][number] | undefined {
	const { consumer, remains } = params
	const tagName = consumer.tagName
	if (
		tagName !== 'ReportControl' &&
		tagName !== 'GSEControl' &&
		tagName !== 'SampledValueControl' &&
		tagName !== 'LogControl'
	)
		return undefined
	const unlinked = remains ? {} : { datSet: undefined }
	if (tagName === 'LogControl') {
		return { source: { tagName, id: consumer.id }, attributes: { ...unlinked, logEna: 'false' } }
	}
	const source = { tagName, id: consumer.id }
	const confRev = extractionConfRev({
		source,
		value: readAttribute({
			record: consumer,
			name: 'confRev',
			defaults: 'none',
			fullObject: true,
		})?.value,
	})
	return { source, attributes: { ...unlinked, confRev } }
}
