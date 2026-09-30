import { toRawRecord, widen } from '@dialecte/core/helpers'

import {
	findProjectEntries,
	foldEntryOperations,
	resolveAffectedIeds,
	syncMinRequestedScdFiles,
} from '@/v2019C1/hooks/shared'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Keep every IED's `MinRequestedSCDFiles` consistent as records are created:
 * - a created trigger (see the `MIN_REQUESTED_SCD_*_TRIGGER_TAGS` constants) syncs the affected
 *   IEDs to the current SCD;
 * - a second `MinRequestedSCDFiles` under one IED (e.g. cloning in an IED that already has one)
 *   absorbs the content of the existing wrapper, which is removed, so one container remains;
 * - a `MinRequestedSCDFile` whose `fileUuid` is already listed is folded into the listed entry.
 */
export async function reconcileMinRequestedScdFileOnCreate<GenericElement extends Scl.ElementsOf>(
	query: Core.Query<Config>,
	params: { childRecord: Scl.RawRecord<GenericElement> },
): Promise<Scl.Operation[]> {
	const record = widen(params.childRecord)

	if (record.tagName === 'MinRequestedSCDFiles') {
		return absorbExistingWrappers(query, { wrapperId: record.id })
	}
	if (record.tagName === 'MinRequestedSCDFile') {
		return foldCreatedEntry(query, { entryId: record.id })
	}

	const iedRefs = await resolveAffectedIeds(query, { record })
	return syncMinRequestedScdFiles(query, { iedRefs })
}

async function absorbExistingWrappers(
	query: Core.Query<Config>,
	params: { wrapperId: string },
): Promise<Scl.Operation[]> {
	const { wrapperId } = params

	const wrapper = await query.getRecord({ tagName: 'MinRequestedSCDFiles', id: wrapperId })
	if (!wrapper?.parent) return []

	const ied = await query.getRecord({ tagName: 'IED', id: wrapper.parent.id })
	if (!ied) return []

	const wrappers = await query.getChildren(ied, 'MinRequestedSCDFiles')
	const existingWrappers = wrappers.filter((candidate) => candidate.id !== wrapperId)
	if (existingWrappers.length === 0) return []

	const operations: Scl.Operation[] = []
	const movedChildren: Scl.RawRecord<'MinRequestedSCDFiles'>['children'] = []
	for (const existingWrapper of existingWrappers) {
		const existingRecord = toRawRecord(existingWrapper)
		for (const childRef of existingRecord.children) {
			const child = await query.getRecord(childRef)
			if (!child) continue

			const childRecord = toRawRecord(widen(child))
			const movedChild = {
				...childRecord,
				parent: { id: wrapperId, tagName: 'MinRequestedSCDFiles' },
			}
			operations.push({
				status: 'updated',
				oldRecord: childRecord,
				newRecord: movedChild as Scl.RawRecord<Scl.ElementsOf>,
			})
			movedChildren.push(childRef)
		}
		operations.push({ status: 'deleted', oldRecord: widen(existingRecord), newRecord: undefined })
	}

	const wrapperRecord = toRawRecord(wrapper)
	const updatedWrapper: Scl.RawRecord<'MinRequestedSCDFiles'> = {
		...wrapperRecord,
		children: [...movedChildren, ...wrapperRecord.children],
	}
	const existingIds = new Set(existingWrappers.map((existingWrapper) => existingWrapper.id))
	const iedRecord = toRawRecord(ied)
	const updatedIed: Scl.RawRecord<'IED'> = {
		...iedRecord,
		children: iedRecord.children.filter((child) => !existingIds.has(child.id)),
	}

	return [
		...operations,
		{ status: 'updated', oldRecord: widen(wrapperRecord), newRecord: widen(updatedWrapper) },
		{ status: 'updated', oldRecord: widen(iedRecord), newRecord: widen(updatedIed) },
	]
}

async function foldCreatedEntry(
	query: Core.Query<Config>,
	params: { entryId: string },
): Promise<Scl.Operation[]> {
	const { entryId } = params

	const entry = await query.getRecord({ tagName: 'MinRequestedSCDFile', id: entryId })
	if (!entry?.parent) return []

	const fileUuid = await query.getAttribute(entry, { name: 'fileUuid' })
	if (!fileUuid) return []

	const wrapper = await query.getRecord({ tagName: 'MinRequestedSCDFiles', id: entry.parent.id })
	if (!wrapper) return []

	const projectEntries = await findProjectEntries(query, { wrapper, fileUuid })
	const kept = projectEntries.find((projectEntry) => projectEntry.id !== entryId)
	if (!kept) return []

	return foldEntryOperations(query, { wrapper, kept, duplicates: [entry] })
}
