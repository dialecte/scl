import { dataCleanupCapability } from './data-cleanup-capability'
import { resolveControlBlock } from './resolve-control-block'

import { readAttribute, readAttributes } from '@/v2019C1/helpers'
import { confRevRaisesOf } from '@/v2019C1/hooks/shared/data-set-entry'

import type { KeptCleanup } from '../transaction/unsubscribe.types'
import type { ControlBlockNode, IedNode, IedSection } from './ied-section.types'
import type { SubscriptionBookkeeping } from './plan-subscription-bookkeeping.types'
import type {
	ConfRevChange,
	PlanUnusedDataCleanupParams,
	UnusedDataCleanupPlan,
} from './plan-unused-data-cleanup.types'
import type { UnusedDataSection } from './unused-data-section.types'

/** Plans publisher data cleanup after the given subscriptions end. Reads only the cached dataflow context. */
export async function planUnusedDataCleanup(
	params: PlanUnusedDataCleanupParams,
): Promise<UnusedDataCleanupPlan> {
	const { context, ending, bookkeeping } = params
	const section = await context.iedSection()
	const unusedData = await context.unusedDataSection()
	const byControlBlock = await context.extRefsByControlBlock()
	const endingIds = new Set(ending.map((extRef) => extRef.record.id))
	const affected = await affectedControlBlocks(params)

	const deletedRegistrations = deletedRegistrationIds({ bookkeeping })
	const retainedRegistrations = controlBlockIdsWithRegistrations({
		section,
		deletedRegistrations,
	})
	const dataSets = unusedData.dataSets.filter((dataSet) =>
		[...affected.values()].some(
			(controlBlock) =>
				controlBlock.ln?.id === dataSet.ln?.id && dataSetNamed({ controlBlock, dataSet }),
		),
	)
	const readersByDataSet = new Map<string, IedNode<'ExtRef'>[]>()
	for (const dataSet of dataSets) {
		const readers = [...section.controlBlocks.values()].flatMap((controlBlock) => {
			if (controlBlock.ln?.id !== dataSet.ln?.id || !dataSetNamed({ controlBlock, dataSet }))
				return []
			return (byControlBlock.get(controlBlock.record.id) ?? []).filter(
				(extRef) => !endingIds.has(extRef.record.id),
			)
		})
		readersByDataSet.set(dataSet.record.id, readers)
	}

	const entries = planFcdas({ section, unusedData, readersByDataSet, retainedRegistrations })
	const sets = planDataSets({
		section,
		unusedData,
		dataSets,
		removedFcdas: new Set(entries.fcdas.map((fcda) => fcda.record.id)),
	})
	const blocks = planControlBlocks({
		unusedData,
		affected,
		byControlBlock,
		endingIds,
		deletedRegistrations,
		removedDataSetIds: new Set(sets.dataSets.map((dataSet) => dataSet.record.id)),
	})
	const confRevs = planConfRevs({
		sectionControlBlocks: [...section.controlBlocks.values()],
		dataSets,
		removedDataSets: new Set(sets.dataSets.map((dataSet) => dataSet.record.id)),
		removedFcdas: new Set(entries.fcdas.map((fcda) => fcda.record.id)),
		deletedControlBlocks: new Set(
			blocks.controlBlocks.map((controlBlock) => controlBlock.record.id),
		),
	})
	return {
		...entries,
		...sets,
		...blocks,
		confRevs,
		kept: [...entries.kept, ...sets.kept, ...blocks.kept],
	}
}

function deletedRegistrationIds(params: {
	bookkeeping: SubscriptionBookkeeping
}): ReadonlySet<string> {
	return new Set(
		params.bookkeeping.registrations
			.filter((operation) => operation.effect === 'deleted')
			.map((operation) => operation.element.id),
	)
}

function controlBlockIdsWithRegistrations(params: {
	section: IedSection
	deletedRegistrations: ReadonlySet<string>
}): ReadonlySet<string> {
	return new Set(
		[...params.section.controlBlocks.values()].flatMap((controlBlock) =>
			controlBlock.registrations.some(
				(registration) => !params.deletedRegistrations.has(registration.record.id),
			)
				? [controlBlock.record.id]
				: [],
		),
	)
}

async function affectedControlBlocks(
	params: PlanUnusedDataCleanupParams,
): Promise<ReadonlyMap<string, ControlBlockNode>> {
	const { context, ending } = params
	const affected = new Map<string, ControlBlockNode>()
	for (const extRef of ending) {
		const controlBlock = await resolveControlBlock({ extRef, context })
		if (controlBlock) affected.set(controlBlock.record.id, controlBlock)
	}
	return affected
}

function planFcdas(params: {
	section: IedSection
	unusedData: UnusedDataSection
	readersByDataSet: ReadonlyMap<string, IedNode<'ExtRef'>[]>
	retainedRegistrations: ReadonlySet<string>
}): Pick<UnusedDataCleanupPlan, 'fcdas' | 'kept'> {
	const { section, unusedData, readersByDataSet, retainedRegistrations } = params
	const fcdas: IedNode<'FCDA'>[] = []
	const kept: KeptCleanup[] = []
	const retainedDataSets = new Set(
		[...section.controlBlocks.values()].flatMap((controlBlock) =>
			retainedRegistrations.has(controlBlock.record.id)
				? unusedData.dataSets
						.filter((dataSet) => dataSetNamed({ controlBlock, dataSet }))
						.map((dataSet) => dataSet.record.id)
				: [],
		),
	)
	for (const fcda of unusedData.fcdas.filter((entry) =>
		readersByDataSet.has(entry.record.parent?.id ?? ''),
	)) {
		const readers = readersByDataSet.get(fcda.record.parent?.id ?? '') ?? []
		const dataSet = unusedData.dataSets.find(
			(candidate) => candidate.record.id === fcda.record.parent?.id,
		)
		const senders =
			dataSet === undefined
				? []
				: [...section.controlBlocks.values()].filter((controlBlock) =>
						dataSetNamed({ controlBlock, dataSet }),
					)
		const dataSetCapability = dataSet
			? dataCleanupCapability({ node: dataSet, services: unusedData.services, senders })
			: 'not-modifiable'
		const capability =
			dataSetCapability === 'modifiable' || readers.some((reader) => readsFcda({ reader, fcda }))
				? dataCleanupCapability({ node: fcda, services: unusedData.services })
				: dataSetCapability
		if (capability !== 'modifiable') {
			kept.push({ element: fcda.ref, why: capability })
		} else if (retainedDataSets.has(fcda.record.parent?.id ?? '')) {
			kept.push({ element: fcda.ref, why: 'used' })
		} else if (readers.some((reader) => readsFcda({ reader, fcda }))) {
			kept.push({ element: fcda.ref, why: 'used' })
		} else {
			fcdas.push(fcda)
		}
	}
	return { fcdas, kept }
}

function planDataSets(params: {
	section: IedSection
	unusedData: UnusedDataSection
	dataSets: IedNode<'DataSet'>[]
	removedFcdas: ReadonlySet<string>
}): Pick<UnusedDataCleanupPlan, 'dataSets' | 'kept'> {
	const { section, unusedData, dataSets, removedFcdas } = params
	const kept: KeptCleanup[] = []
	const dataSetsRemoved: IedNode<'DataSet'>[] = []
	for (const dataSet of dataSets) {
		const senders = [...section.controlBlocks.values()].filter((controlBlock) =>
			dataSetNamed({ controlBlock, dataSet }),
		)
		const capability = dataCleanupCapability({
			node: dataSet,
			services: unusedData.services,
			senders,
		})
		if (capability !== 'modifiable') {
			kept.push({ element: dataSet.ref, why: capability })
			continue
		}
		const entries = unusedData.fcdas.filter((fcda) => fcda.record.parent?.id === dataSet.record.id)
		if (entries.some((entry) => !removedFcdas.has(entry.record.id))) {
			kept.push({ element: dataSet.ref, why: 'used' })
			continue
		}
		dataSetsRemoved.push(dataSet)
	}
	return { dataSets: dataSetsRemoved, kept }
}

function planControlBlocks(params: {
	unusedData: UnusedDataSection
	affected: ReadonlyMap<string, ControlBlockNode>
	byControlBlock: ReadonlyMap<string, readonly IedNode<'ExtRef'>[]>
	endingIds: ReadonlySet<string>
	deletedRegistrations: ReadonlySet<string>
	removedDataSetIds: ReadonlySet<string>
}): Pick<UnusedDataCleanupPlan, 'controlBlocks' | 'kept'> {
	const {
		unusedData,
		affected,
		byControlBlock,
		endingIds,
		deletedRegistrations,
		removedDataSetIds,
	} = params
	const kept: KeptCleanup[] = []
	const controlBlocks: ControlBlockNode[] = []
	for (const controlBlock of affected.values()) {
		const capability = dataCleanupCapability({
			node: controlBlock,
			services: unusedData.services,
		})
		if (capability !== 'modifiable') {
			kept.push({ element: controlBlock.ref, why: capability })
			continue
		}
		const dataSet = unusedData.dataSets.find(
			(candidate) =>
				candidate.ln?.id === controlBlock.ln?.id &&
				dataSetNamed({ controlBlock, dataSet: candidate }),
		)
		const bound = (byControlBlock.get(controlBlock.record.id) ?? []).some(
			(extRef) => !endingIds.has(extRef.record.id),
		)
		const registered = controlBlock.registrations.some(
			(registration) => !deletedRegistrations.has(registration.record.id),
		)
		const sendsData =
			readAttribute({
				record: controlBlock.record,
				name: 'datSet',
				defaults: 'none',
			}) !== undefined && !removedDataSetIds.has(dataSet?.record.id ?? '')
		if (bound || registered || sendsData) {
			kept.push({ element: controlBlock.ref, why: 'used' })
			continue
		}
		controlBlocks.push(controlBlock)
	}
	return { controlBlocks, kept }
}

function planConfRevs(params: {
	sectionControlBlocks: ControlBlockNode[]
	dataSets: IedNode<'DataSet'>[]
	removedDataSets: ReadonlySet<string>
	removedFcdas: ReadonlySet<string>
	deletedControlBlocks: ReadonlySet<string>
}): ConfRevChange[] {
	const { sectionControlBlocks, dataSets, removedDataSets, removedFcdas, deletedControlBlocks } =
		params
	const changes = new Map<string, ConfRevChange>()
	for (const dataSet of dataSets) {
		const structureChanged =
			removedDataSets.has(dataSet.record.id) ||
			dataSet.record.children.some((child) => removedFcdas.has(child.id))
		if (!structureChanged) continue
		const blocks = sectionControlBlocks.filter(
			(controlBlock) =>
				controlBlock.ln?.id === dataSet.ln?.id && dataSetNamed({ controlBlock, dataSet }),
		)
		const raises = confRevRaisesOf({
			dataSetName: readAttribute({
				record: dataSet.record,
				name: 'name',
				defaults: 'none',
			}),
			blocks: blocks.map((controlBlock) => controlBlock.record),
		})
		for (const raise of raises) {
			const controlBlock = blocks.find((block) => block.record.id === raise.block.id)
			if (!controlBlock || deletedControlBlocks.has(controlBlock.record.id)) continue
			changes.set(controlBlock.record.id, {
				controlBlock,
				from:
					readAttribute({
						record: controlBlock.record,
						name: 'confRev',
						defaults: 'none',
					}) ?? '',
				to: raise.confRev,
			})
		}
	}
	return [...changes.values()]
}

function dataSetNamed(params: {
	controlBlock: ControlBlockNode
	dataSet: IedNode<'DataSet'>
}): boolean {
	const { controlBlock, dataSet } = params
	return (
		readAttribute({ record: controlBlock.record, name: 'datSet', defaults: 'none' }) ===
		readAttribute({ record: dataSet.record, name: 'name', defaults: 'none' })
	)
}

function readsFcda(params: { reader: IedNode<'ExtRef'>; fcda: IedNode<'FCDA'> }): boolean {
	const reader = readAttributes({
		record: params.reader.record,
		defaults: 'none',
	})
	const fcda = readAttributes({
		record: params.fcda.record,
		defaults: 'none',
	})
	const sameLogicalNode =
		reader.lnUuid !== undefined && fcda.lnUuid !== undefined
			? reader.lnUuid === fcda.lnUuid
			: ['ldInst', 'prefix', 'lnClass', 'lnInst'].every((name) => reader[name] === fcda[name])
	return (
		sameLogicalNode &&
		reader.doName === fcda.doName &&
		(fcda.daName === undefined || reader.daName === undefined || reader.daName === fcda.daName)
	)
}
