import { toRawRecord, widen } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { updatedOperation, upsertAttribute } from '@/v2019C1/hooks/shared/record-ops'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const MANAGED_ATTRIBUTE_NAMES = ['fileType', 'fileUuid', 'revision', 'version'] as const

type ManagedAttributeName = (typeof MANAGED_ATTRIBUTE_NAMES)[number]
type ManagedAttributes = Record<ManagedAttributeName, string>

export async function syncMinRequestedScdFiles(params: {
	iedRefs: Scl.Ref<'IED'>[]
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { iedRefs, query } = params
	const operations: Scl.Operation[] = []
	const seen = new Set<string>()
	for (const iedRef of iedRefs) {
		if (seen.has(iedRef.id)) continue
		seen.add(iedRef.id)
		operations.push(...(await syncMinRequestedScdFile({ iedRef, query })))
	}
	return operations
}

export async function syncMinRequestedScdFile(params: {
	iedRef: Scl.Ref<'IED'>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { iedRef, query } = params

	const ied = await query.getRecord(iedRef)
	if (!ied) return []

	const managed = await readManagedAttributes(query)

	const wrapper = await query.getChild(ied, 'MinRequestedSCDFiles')
	if (!wrapper) return createEntryOperations({ ied, wrapper: undefined, managed })

	const [entry, ...surplusEntries] = await query.getChildren(wrapper, 'MinRequestedSCDFile')
	if (!entry) return createEntryOperations({ ied, wrapper, managed })

	return [
		...updateEntryOperations({ entry, managed }),
		...removeSurplusEntryOperations({ wrapper, surplusEntries }),
	]
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

/** Drop every entry past the first one, and unlink them from the wrapper in the same breath. */
function removeSurplusEntryOperations(params: {
	wrapper: Scl.TrackedRecord<'MinRequestedSCDFiles'>
	surplusEntries: Scl.TrackedRecord<'MinRequestedSCDFile'>[]
}): Scl.Operation[] {
	const { wrapper, surplusEntries } = params
	if (surplusEntries.length === 0) return []

	const surplusIds = new Set(surplusEntries.map((entry) => entry.id))
	const wrapperRecord = toRawRecord(wrapper)
	const updatedWrapper: Scl.RawRecord<'MinRequestedSCDFiles'> = {
		...wrapperRecord,
		children: wrapperRecord.children.filter((child) => !surplusIds.has(child.id)),
	}

	return [
		...surplusEntries.map((entry) => ({
			status: 'deleted' as const,
			oldRecord: widen(toRawRecord(entry)),
			newRecord: undefined,
		})),
		{ status: 'updated', oldRecord: widen(wrapperRecord), newRecord: widen(updatedWrapper) },
	]
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
