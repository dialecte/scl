import { readAttribute } from './read-attributes'
import { VALUE_IMPORT_ATTRIBUTE, VALUE_IMPORTED } from './value-import.constants'

import type { ReadValueImportParams } from './value-import.types'

/**
 * Whether the system tool may import a value of a `DAI` (its effective `valImport`): the `DAI`'s own `valImport`, else
 * that of the `DA` / `BDA` it gives its value for, else `false` (the schema default). `true` and `1` are true.
 *
 * @intent effective valImport of a DAI, whether a DAI value may be imported by the system tool, DAI valImport inherited from its DA or BDA
 */
export function readValueImport(params: ReadValueImportParams): boolean {
	const { instance, dataAttribute } = params
	const own = readAttribute({ record: instance, name: VALUE_IMPORT_ATTRIBUTE, defaults: 'none' })
	const inherited = dataAttribute
		? readAttribute({ record: dataAttribute, name: VALUE_IMPORT_ATTRIBUTE, defaults: 'none' })
		: ''
	return VALUE_IMPORTED.has(own || inherited)
}
