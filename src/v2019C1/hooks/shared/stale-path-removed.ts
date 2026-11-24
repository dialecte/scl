import { MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference'
import { readAttribute } from '@/v2019C1/helpers'
import { REQUIRED_PATHS } from '@/v2019C1/hooks/shared/path-references.constants'

import type { Scl } from '@/v2019C1/config'
import type { DerivedAttributeValue } from '@/v2019C1/extensions/reference'

/**
 * The path a reference holds, removed when the element its uuid names gives it none (out of the reach of a path read
 * from its own place, or with no address of its own): a path never names another element than the uuid. A path the
 * definition requires is kept, and so is a mapped data name (`DOS` / `SDS` / `DAS`: its name is data in the logical
 * node its uuid names, never built as a path).
 */
export function stalePathRemoved(params: {
	record: Scl.RawRecord<Scl.ElementsOf>
	pathAttribute: string
	values: readonly DerivedAttributeValue[]
}): DerivedAttributeValue[] {
	const { record, pathAttribute: path, values } = params
	if (MAPPED_NAME_REFS.has(record.tagName)) return []
	if (values.some((value) => value.name === path)) return []
	if (!readAttribute({ record, name: path, defaults: 'none' })) return []
	if (REQUIRED_PATHS.has(`${record.tagName}@${path}`)) return []
	return [{ name: path, value: undefined }]
}
