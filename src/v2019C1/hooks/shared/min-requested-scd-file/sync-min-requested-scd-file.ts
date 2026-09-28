import { toRawRecord, widen } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { updatedOperation, upsertAttribute } from '@/v2019C1/hooks/shared/record-ops'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const MANAGED_ATTRIBUTE_NAMES = ['fileType', 'fileUuid', 'revision', 'version'] as const

type ManagedAttributeName = (typeof MANAGED_ATTRIBUTE_NAMES)[number]
type ManagedAttributes = Record<ManagedAttributeName, string>

export async function syncMinRequestedScdFile(params: {
	iedRef: Scl.Ref<'IED'>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { iedRef, query } = params

	const ied = await query.getRecord(iedRef)
	if (!ied) return []

	const managed = await readManagedAttributes(query)

	const wrapper = await query.getChild(ied, 'MinRequestedSCDFiles')
	const entries = wrapper ? await query.getChildren(wrapper, 'MinRequestedSCDFile') : []
	const entry = await selectManagedEntry({ query, entries, fileUuid: managed.fileUuid })

	if (entry) return updateEntryOperations({ entry, managed })
	return createEntryOperations({ ied, wrapper, managed })
}

async function readManagedAttributes(query: Core.Query<Config>): Promise<ManagedAttributes> {
	const [header] = await query.getRecordsByTagName('Header')
	const attributes = header ? await query.getAttributes(header) : undefined

	return {
		fileType: 'SCD',
		fileUuid: normalize(attributes?.uuid),
		revision: normalize(attributes?.revision),
		version: normalize(attributes?.version),
	}
}

function normalize(value: string | undefined): string {
	return (value ?? '').trim()
}

async function selectManagedEntry(params: {
	query: Core.Query<Config>
	entries: Scl.TrackedRecord<'MinRequestedSCDFile'>[]
	fileUuid: string
}): Promise<Scl.TrackedRecord<'MinRequestedSCDFile'> | undefined> {
	const { query, entries, fileUuid } = params

	for (const entry of entries) {
		if ((await query.getAttribute(entry, { name: 'fileUuid' })) === fileUuid) return entry
	}

	return entries[0]
}

function updateEntryOperations(params: {
	entry: Scl.TrackedRecord<'MinRequestedSCDFile'>
	managed: ManagedAttributes
}): Scl.Operation[] {
	const { entry, managed } = params

	const record = toRawRecord(entry)
	let attributes: { name: string; value: string }[] = [...record.attributes]
	let changed = false

	for (const name of MANAGED_ATTRIBUTE_NAMES) {
		if (attributes.find((attribute) => attribute.name === name)?.value === managed[name]) continue
		attributes = upsertAttribute(attributes, name, managed[name])
		changed = true
	}

	if (!changed) return []
	return [updatedOperation(widen(record), attributes)]
}

function createEntryOperations(params: {
	ied: Scl.TrackedRecord<'IED'>
	wrapper: Scl.TrackedRecord<'MinRequestedSCDFiles'> | undefined
	managed: ManagedAttributes
}): Scl.Operation[] {
	const { ied, wrapper, managed } = params

	const attributes = MANAGED_ATTRIBUTE_NAMES.map((name) => ({ name, value: managed[name] }))

	if (wrapper) {
		const wrapperRecord = toRawRecord(wrapper)
		const entry = newEntryRecord({ parentId: wrapperRecord.id, attributes })
		const updatedWrapper: Scl.RawRecord<'MinRequestedSCDFiles'> = {
			...wrapperRecord,
			children: [...wrapperRecord.children, { id: entry.id, tagName: 'MinRequestedSCDFile' }],
		}

		return [
			{ status: 'created', oldRecord: undefined, newRecord: widen(entry) },
			{ status: 'updated', oldRecord: widen(wrapperRecord), newRecord: widen(updatedWrapper) },
		]
	}

	const iedRecord = toRawRecord(ied)
	const wrapperId = crypto.randomUUID()
	const entry = newEntryRecord({ parentId: wrapperId, attributes })
	const newWrapper: Scl.RawRecord<'MinRequestedSCDFiles'> = {
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
		children: [...iedRecord.children, { id: newWrapper.id, tagName: 'MinRequestedSCDFiles' }],
	}

	return [
		{ status: 'created', oldRecord: undefined, newRecord: widen(newWrapper) },
		{ status: 'created', oldRecord: undefined, newRecord: widen(entry) },
		{ status: 'updated', oldRecord: widen(iedRecord), newRecord: widen(updatedIed) },
	]
}

function newEntryRecord(params: {
	parentId: string
	attributes: { name: ManagedAttributeName; value: string }[]
}): Scl.RawRecord<'MinRequestedSCDFile'> {
	const { parentId, attributes } = params

	return {
		id: crypto.randomUUID(),
		tagName: 'MinRequestedSCDFile',
		namespace: SCL_DIALECTE_CONFIG.namespaces.default,
		attributes,
		value: '',
		parent: { id: parentId, tagName: 'MinRequestedSCDFiles' },
		children: [],
	}
}
