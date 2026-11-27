import { buildCascadeOperations } from '../before-delete'

import { toTrackedRecord, widen } from '@dialecte/core/helpers'

import { createDataflowContext } from '@/v2019C1/extensions/dataflow/query/dataflow-context'
import { planSubscriptionBookkeeping } from '@/v2019C1/extensions/dataflow/query/plan-subscription-bookkeeping'
import { resolveControlBlock } from '@/v2019C1/extensions/dataflow/query/resolve-control-block'
import { readAttribute } from '@/v2019C1/helpers'
import { hasAttributeChange, withAttributeValues, updatedOperation } from '@/v2019C1/hooks/shared'
import { CONTROL_BLOCK_ATTRIBUTES_BY_TAG } from '@/v2019C1/hooks/shared/input-source.constants'

import type { DeleteCascade } from '../before-delete'
import type { CommitStepParams, CommitStepResult } from './commit-plan.types'
import type { Scl } from '@/v2019C1/config'
import type { DataflowContext } from '@/v2019C1/extensions/dataflow/query/dataflow-context.types'
import type {
	ControlBlockNode,
	IedNode,
	IedSection,
} from '@/v2019C1/extensions/dataflow/query/ied-section.types'
import type { RegistrationOperation } from '@/v2019C1/extensions/dataflow/query/plan-subscription-bookkeeping.types'

/** Stages the subscription bookkeeping for ExtRefs and publisher control blocks the transaction ended. */
export async function subscriptionBookkeeping({
	plan,
	writes,
}: CommitStepParams): Promise<CommitStepResult> {
	const operations = [...plan.operations, ...[...plan.staged.values()].flat()]
	if (!canEndSubscription({ operations })) return { operations: [] }
	const before = createDataflowContext(plan.query, {
		operations,
		snapshot: 'before',
	})
	const after = createDataflowContext(plan.query, {
		operations,
		snapshot: 'after',
	})
	const ending = await endingTargets({ operations, before, after })
	if (ending.length === 0) return { operations: [] }
	const bookkeeping = await planSubscriptionBookkeeping({ context: before, ending })
	const occupied = new Set(
		operations.flatMap((operation) => [
			operation.status === 'deleted' ? operation.oldRecord.id : operation.newRecord.id,
		]),
	)
	const section = await before.iedSection()
	const registrations = await registrationOperations({
		bookkeeping: bookkeeping.registrations,
		occupied,
		section,
	})
	const values = await supervisionValues({
		ids: bookkeeping.supervisions.map(({ val }) => val.id).filter((id) => !occupied.has(id)),
		query: plan.query,
	})
	const deleted = [
		...registrations.deleted.map((record) => toTrackedRecord({ record: widen(record) })),
		...values,
	]
	const cascade: DeleteCascade = {
		gone: new Set(deleted.map((record) => record.id)),
		causeById: new Map(),
		deleted,
		within: [],
		cleared: [],
	}
	const deletions =
		deleted.length === 0
			? []
			: await buildCascadeOperations(plan.query, {
					cascade,
					deletedRoots: [],
					pending: writes.pending,
				})
	return { operations: [...deletions, ...registrations.cleared] }
}

function canEndSubscription(params: { operations: ReadonlyArray<Scl.Operation> }): boolean {
	return params.operations.some((operation) => {
		const record = operation.status === 'deleted' ? operation.oldRecord : operation.newRecord
		if (!record) return false
		if (record.tagName === 'ExtRef') {
			if (operation.status === 'deleted') return true
			if (operation.status === 'created') return false
			const oldUuid = readAttribute({
				record: operation.oldRecord,
				name: 'srcCBUuid',
				defaults: 'none',
			})
			const newUuid = readAttribute({
				record: operation.newRecord,
				name: 'srcCBUuid',
				defaults: 'none',
			})
			if (oldUuid || newUuid) return oldUuid !== newUuid
			return hasAttributeChange({
				oldRecord: operation.oldRecord,
				newRecord: operation.newRecord,
				names: CONTROL_BLOCK_ATTRIBUTES_BY_TAG.get('ExtRef') ?? [],
			})
		}
		return (
			operation.status === 'deleted' &&
			(record.tagName === 'GSEControl' ||
				record.tagName === 'SampledValueControl' ||
				record.tagName === 'ReportControl')
		)
	})
}

async function endingTargets(params: {
	operations: ReadonlyArray<Scl.Operation>
	before: DataflowContext
	after: DataflowContext
}): Promise<(IedNode<'ExtRef'> | ControlBlockNode)[]> {
	const { operations, before, after } = params
	const deleted = new Set(
		operations.flatMap((operation) =>
			operation.status === 'deleted' ? [operation.oldRecord.id] : [],
		),
	)
	const beforeSection = await before.iedSection()
	const afterSection = await after.iedSection()
	const endingExtRefs = []
	const afterExtRefs = new Map(
		afterSection.extRefs.map((extRef) => [extRef.record.id, extRef] as const),
	)
	for (const extRef of beforeSection.extRefs) {
		const beforeBlock = await resolveControlBlock({ extRef, context: before })
		if (!beforeBlock) continue
		const afterExtRef = afterExtRefs.get(extRef.record.id)
		const afterBlock =
			afterExtRef === undefined
				? undefined
				: await resolveControlBlock({ extRef: afterExtRef, context: after })
		if (deleted.has(extRef.record.id) || beforeBlock.record.id !== afterBlock?.record.id)
			endingExtRefs.push(extRef)
	}
	const endingControlBlocks = [...beforeSection.controlBlocks.values()].filter((controlBlock) =>
		deleted.has(controlBlock.record.id),
	)
	return [...endingExtRefs, ...endingControlBlocks]
}

async function registrationOperations(params: {
	bookkeeping: readonly RegistrationOperation[]
	occupied: ReadonlySet<string>
	section: IedSection
}): Promise<{
	deleted: Scl.RawRecord<Scl.ElementsOf>[]
	cleared: Scl.Operation[]
}> {
	const { bookkeeping, occupied, section } = params
	const registrations = new Map(
		[...section.controlBlocks.values()].flatMap((controlBlock) =>
			controlBlock.registrations.map((registration) => [
				registration.record.id,
				widen(registration.record as Scl.RawRecord<'IEDName' | 'ClientLN'>),
			]),
		),
	)
	const deleted: Scl.RawRecord<Scl.ElementsOf>[] = []
	const cleared: Scl.Operation[] = []
	for (const operation of bookkeeping) {
		if (occupied.has(operation.element.id)) continue
		const record = registrations.get(operation.element.id)
		if (!record) continue
		if (operation.effect === 'deleted') {
			deleted.push(record)
			continue
		}
		const attributes = withAttributeValues(
			record.attributes,
			operation.attributes.map((name) => ({ name, value: undefined })),
		)
		cleared.push(updatedOperation(widen(record), attributes))
	}
	return { deleted, cleared }
}

async function supervisionValues(params: {
	ids: readonly string[]
	query: CommitStepParams['plan']['query']
}): Promise<Scl.TrackedRecord<Scl.ElementsOf>[]> {
	const { ids, query } = params
	if (ids.length === 0) return []
	const records = await query.getRecords(
		[...new Set(ids)].map((id) => ({ tagName: 'Val', id }) as Scl.Ref<'Val'>),
	)
	return records.flatMap((record) => (record ? [widen(record)] : []))
}
