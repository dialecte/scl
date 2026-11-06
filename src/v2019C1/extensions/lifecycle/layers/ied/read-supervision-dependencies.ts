import { extractionConfRev } from './extraction-conf-rev'

import { resolveDefinition } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { collectWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry'
import { referrerTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/referrer-tuple-address'
import { targetTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/target-tuple-address'
import { readAttribute } from '@/v2019C1/helpers'
import { findDataSetUsers } from '@/v2019C1/hooks/shared/find-data-set-users'

import type { SupervisionDependencyPlan } from './supervision-dependencies.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** Preflight the surviving DataSets and controls depending on omitted supervision, without changing either document. */
export async function readSupervisionDependencies(
	query: Core.Query<Config>,
	params: { iedRef: Scl.Ref<'IED'>; leaveOut: ReadonlySet<string> },
): Promise<SupervisionDependencyPlan> {
	const { iedRef, leaveOut } = params
	const collected = await collectWithAncestry(query, { root: iedRef })
	const nativeRecords = collected.records.filter((record) => {
		const definition = resolveDefinition({ dialecteConfig: SCL_DIALECTE_CONFIG, record })
		return record.namespace.uri === definition?.namespace.uri
	})
	const omittedUuids = new Set<string>()
	const omittedAddresses = new Set<string>()
	for (const record of nativeRecords) {
		if (record.tagName !== 'LN' || !leaveOut.has(record.id)) continue
		const uuid = readAttribute({ record, name: 'uuid', defaults: 'none', fullObject: true })?.value
		if (uuid) omittedUuids.add(uuid)
		const address = targetTupleAddress({ record, ancestry: collected.ancestryOf(record.id) })
		if (address) omittedAddresses.add(address)
	}
	const surviving = nativeRecords.filter(
		(record) =>
			!leaveOut.has(record.id) &&
			!collected.ancestryOf(record.id).some((ancestor) => leaveOut.has(ancestor.id)),
	)
	const plan: SupervisionDependencyPlan = {
		fcdas: [],
		emptyDataSets: [],
		payloadDataSets: [],
		consumers: [],
	}
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
				? omittedUuids.has(twin.value)
				: address !== undefined && omittedAddresses.has(address)
		if (!namesOmitted) continue
		plan.fcdas.push({ tagName: 'FCDA', id: record.id })
		const removed = removedByDataSet.get(record.parent.id) ?? new Set<string>()
		removed.add(record.id)
		removedByDataSet.set(record.parent.id, removed)
	}
	const plannedConsumers = new Set<string>()
	for (const dataSet of surviving) {
		if (dataSet.tagName !== 'DataSet') continue
		const removed = removedByDataSet.get(dataSet.id)
		if (!removed) continue
		const remains = surviving.some(
			(record) =>
				record.tagName === 'FCDA' && record.parent?.id === dataSet.id && !removed.has(record.id),
		)
		if (!remains) {
			const collection =
				dataSet.value || dataSet.children.some((child) => !removed.has(child.id))
					? plan.payloadDataSets
					: plan.emptyDataSets
			collection.push({ tagName: 'DataSet', id: dataSet.id })
		}
		const consumers = await findDataSetUsers(query, {
			dataSet: { tagName: 'DataSet', id: dataSet.id },
		})
		for (const consumer of consumers) {
			if (plannedConsumers.has(consumer.id)) continue
			if (
				leaveOut.has(consumer.id) ||
				collected.ancestryOf(consumer.id).some((ancestor) => leaveOut.has(ancestor.id))
			)
				continue
			const tagName = consumer.tagName
			if (
				tagName !== 'ReportControl' &&
				tagName !== 'GSEControl' &&
				tagName !== 'SampledValueControl' &&
				tagName !== 'LogControl'
			)
				continue
			const source = { tagName, id: consumer.id }
			const attributes: SupervisionDependencyPlan['consumers'][number]['attributes'] = remains
				? {}
				: { datSet: undefined }
			if (tagName === 'LogControl') {
				attributes.logEna = 'false'
			} else {
				attributes.confRev = extractionConfRev({
					source: { tagName, id: consumer.id },
					value: readAttribute({
						record: consumer,
						name: 'confRev',
						defaults: 'none',
						fullObject: true,
					})?.value,
				})
			}
			plan.consumers.push({ source, attributes })
			plannedConsumers.add(consumer.id)
		}
	}
	return plan
}
