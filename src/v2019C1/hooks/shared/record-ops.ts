import type { Scl } from '@/v2019C1/config'
import type { DerivedAttributeValue } from '@/v2019C1/extensions/reference'

/** A plain attribute list as built by the reconcile helpers. */
export type AttributeList = readonly { name: string; value: string }[]

/**
 * Build an `updated` operation that replaces a record's attribute list. The plain
 * `{ name, value }` list is widened to the typed attribute array here — the one
 * place `Scl.Operation`'s strict record type is satisfied — so callers stay
 * cast-free.
 */
export function updatedOperation(
	record: Scl.RawRecord<Scl.ElementsOf>,
	attributes: AttributeList,
): Scl.Operation {
	return {
		status: 'updated',
		oldRecord: record,
		newRecord: { ...record, attributes } as unknown as Scl.RawRecord<Scl.ElementsOf>,
	}
}

/**
 * Read an attribute from a record snapshot. Only for a state `query` can no longer reach, such as
 * the `oldRecord` of an update hook; read the current state through `query.getAttribute`.
 */
export function readSnapshotAttribute(params: {
	record: Scl.RawRecord<Scl.ElementsOf>
	name: string
}): string | undefined {
	const { record, name } = params
	return record.attributes.find((attribute) => attribute.name === name)?.value
}

/** Whether any of the named attributes differs between two snapshots of one record. */
export function hasAttributeChange(params: {
	oldRecord: Scl.RawRecord<Scl.ElementsOf>
	newRecord: Scl.RawRecord<Scl.ElementsOf>
	names: readonly string[]
}): boolean {
	const { oldRecord, newRecord, names } = params
	return names.some(
		(name) =>
			readSnapshotAttribute({ record: oldRecord, name }) !==
			readSnapshotAttribute({ record: newRecord, name }),
	)
}

/** Names of the attributes whose value differs between two snapshots of one record. */
export function changedAttributeNames(params: {
	oldRecord: Scl.RawRecord<Scl.ElementsOf>
	newRecord: Scl.RawRecord<Scl.ElementsOf>
}): string[] {
	const { oldRecord, newRecord } = params
	const names = new Set(
		[...oldRecord.attributes, ...newRecord.attributes].map((attribute) => attribute.name),
	)
	return [...names].filter(
		(name) =>
			readSnapshotAttribute({ record: oldRecord, name }) !==
			readSnapshotAttribute({ record: newRecord, name }),
	)
}

/** Upsert (replace-or-append) an attribute value on a plain attribute list. */
export function upsertAttribute(
	attributes: AttributeList,
	name: string,
	value: string,
): { name: string; value: string }[] {
	const exists = attributes.some((a) => a.name === name)
	if (exists) return attributes.map((a) => (a.name === name ? { ...a, value } : a))
	return [...attributes, { name, value }]
}

/**
 * The attribute list with each value set, or removed when it is `undefined`. The same list when
 * nothing changes, so a caller can tell an update is needed by identity.
 */
export function withAttributeValues(
	attributes: AttributeList,
	values: readonly DerivedAttributeValue[],
): AttributeList {
	let result = attributes
	for (const { name, value } of values) {
		const current = result.find((attribute) => attribute.name === name)?.value
		if (current === value) continue
		result =
			value === undefined
				? result.filter((attribute) => attribute.name !== name)
				: upsertAttribute(result, name, value)
	}
	return result
}
