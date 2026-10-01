import { toRawRecord, widen } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { MIN_REQUESTED_SCD_FILE_USER_ATTRIBUTES } from '@/v2019C1/constants'
import { REQUIRED_ATTRIBUTES } from '@/v2019C1/definition/constants.generated'
import { updatedOperation, upsertAttribute } from '@/v2019C1/hooks/shared/record-ops'

import type { ScdFileReference } from './min-requested-scd-file.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** The wrapper's entries referencing the project `fileUuid`, in document order. */
export async function findProjectEntries(
	query: Core.Query<Config>,
	params: { wrapper: Scl.Ref<'MinRequestedSCDFiles'>; fileUuid: string },
): Promise<Scl.TrackedRecord<'MinRequestedSCDFile'>[]> {
	const { wrapper, fileUuid } = params

	const entries = await query.getChildren(wrapper, 'MinRequestedSCDFile')
	const projectEntries: Scl.TrackedRecord<'MinRequestedSCDFile'>[] = []
	for (const entry of entries) {
		const entryFileUuid = await query.getAttribute(entry, { name: 'fileUuid' })
		if (entryFileUuid === fileUuid) projectEntries.push(entry)
	}
	return projectEntries
}

/**
 * Fold `duplicates` of one project into `kept`: `kept` takes the hand-set attributes it lacks
 * from them, then the `scdFile` managed values when given, and the duplicates are removed.
 */
export async function foldEntryOperations(
	query: Core.Query<Config>,
	params: {
		wrapper: Scl.TrackedRecord<'MinRequestedSCDFiles'>
		kept: Scl.TrackedRecord<'MinRequestedSCDFile'>
		duplicates: Scl.TrackedRecord<'MinRequestedSCDFile'>[]
		scdFile?: ScdFileReference
	},
): Promise<Scl.Operation[]> {
	const { wrapper, kept, duplicates, scdFile } = params

	const keptValues = await query.getAttributes(kept)
	const keptRecord = toRawRecord(kept)
	let attributes: { name: string; value: string }[] = [...keptRecord.attributes]
	const carriedNames = new Set<string>()

	for (const duplicate of duplicates) {
		const duplicateValues = await query.getAttributes(duplicate)
		for (const name of MIN_REQUESTED_SCD_FILE_USER_ATTRIBUTES) {
			if (keptValues[name] || carriedNames.has(name) || !duplicateValues[name]) continue
			carriedNames.add(name)
			attributes = upsertAttribute(attributes, name, duplicateValues[name])
		}
	}

	let managedChanged = false
	if (scdFile) {
		// The required entry attributes are exactly the ones taken from the SCD Header.
		for (const name of REQUIRED_ATTRIBUTES.MinRequestedSCDFile) {
			if (keptValues[name] === scdFile[name]) continue
			managedChanged = true
			attributes = upsertAttribute(attributes, name, scdFile[name])
		}
	}

	const keptChanged = carriedNames.size > 0 || managedChanged
	const keptOperations = keptChanged ? [updatedOperation(widen(keptRecord), attributes)] : []

	return [...keptOperations, ...removeEntryOperations({ wrapper, entries: duplicates })]
}

/** Append a new entry for `scdFile` to an existing wrapper. */
export function appendEntryOperations(params: {
	wrapper: Scl.TrackedRecord<'MinRequestedSCDFiles'>
	scdFile: ScdFileReference
}): Scl.Operation[] {
	const { wrapper, scdFile } = params

	const wrapperRecord = toRawRecord(wrapper)
	const entry = newEntryRecord({ wrapperId: wrapperRecord.id, scdFile })
	const updatedWrapper: Scl.RawRecord<'MinRequestedSCDFiles'> = {
		...wrapperRecord,
		children: [...wrapperRecord.children, { id: entry.id, tagName: 'MinRequestedSCDFile' }],
	}

	return [
		{ status: 'created', oldRecord: undefined, newRecord: widen(entry) },
		{ status: 'updated', oldRecord: widen(wrapperRecord), newRecord: widen(updatedWrapper) },
	]
}

/** Create the wrapper under `ied`, holding a single entry for `scdFile`. */
export function createWrapperOperations(params: {
	ied: Scl.TrackedRecord<'IED'>
	scdFile: ScdFileReference
}): Scl.Operation[] {
	const { ied, scdFile } = params

	const iedRecord = toRawRecord(ied)
	const wrapperId = crypto.randomUUID()
	const entry = newEntryRecord({ wrapperId, scdFile })
	const wrapper: Scl.RawRecord<'MinRequestedSCDFiles'> = {
		id: wrapperId,
		tagName: 'MinRequestedSCDFiles',
		namespace: SCL_DIALECTE_CONFIG.namespaces.default,
		attributes: [],
		value: '',
		parent: { id: iedRecord.id, tagName: 'IED' },
		children: [{ id: entry.id, tagName: 'MinRequestedSCDFile' }],
	}
	const updatedIed: Scl.RawRecord<'IED'> = {
		...iedRecord,
		children: [...iedRecord.children, { id: wrapper.id, tagName: 'MinRequestedSCDFiles' }],
	}

	return [
		{ status: 'created', oldRecord: undefined, newRecord: widen(wrapper) },
		{ status: 'created', oldRecord: undefined, newRecord: widen(entry) },
		{ status: 'updated', oldRecord: widen(iedRecord), newRecord: widen(updatedIed) },
	]
}

function removeEntryOperations(params: {
	wrapper: Scl.TrackedRecord<'MinRequestedSCDFiles'>
	entries: Scl.TrackedRecord<'MinRequestedSCDFile'>[]
}): Scl.Operation[] {
	const { wrapper, entries } = params
	if (entries.length === 0) return []

	const removedIds = new Set(entries.map((entry) => entry.id))
	const wrapperRecord = toRawRecord(wrapper)
	const updatedWrapper: Scl.RawRecord<'MinRequestedSCDFiles'> = {
		...wrapperRecord,
		children: wrapperRecord.children.filter((child) => !removedIds.has(child.id)),
	}

	return [
		...entries.map((entry) => ({
			status: 'deleted' as const,
			oldRecord: widen(toRawRecord(entry)),
			newRecord: undefined,
		})),
		{ status: 'updated', oldRecord: widen(wrapperRecord), newRecord: widen(updatedWrapper) },
	]
}

function newEntryRecord(params: {
	wrapperId: string
	scdFile: ScdFileReference
}): Scl.RawRecord<'MinRequestedSCDFile'> {
	const { wrapperId, scdFile } = params

	return {
		id: crypto.randomUUID(),
		tagName: 'MinRequestedSCDFile',
		namespace: SCL_DIALECTE_CONFIG.namespaces.default,
		attributes: [
			{ name: 'fileType', value: scdFile.fileType },
			{ name: 'fileUuid', value: scdFile.fileUuid },
			{ name: 'version', value: scdFile.version },
			{ name: 'revision', value: scdFile.revision },
		],
		value: '',
		parent: { id: wrapperId, tagName: 'MinRequestedSCDFiles' },
		children: [],
	}
}
