import type { Scl } from '@/v2019C1/config'

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
