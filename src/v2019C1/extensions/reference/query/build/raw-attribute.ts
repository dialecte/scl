import type { AnyRawRecord } from '@dialecte/core'

/** The value of an attribute of a raw record, as it is stored; `undefined` when absent. */
export function readRawAttribute(params: {
	record: AnyRawRecord
	name: string
}): string | undefined {
	const { record, name } = params
	return record.attributes.find((attribute) => attribute.name === name)?.value
}
