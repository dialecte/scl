import { splitLnodeQualifier } from '../resolve/parse-path'

import { MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference/constants'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Compute a `DOS`/`SDS`/`DAS` mapped-name value in its documentation form: the
 * implementing short name, present only when it differs from the specified `name`,
 * otherwise omitted.
 *
 * The implementing element is authored on the record itself
 * (`mappedDoName`/`mappedDaName`), either already short or as a legacy full
 * ObjectReference (`IED/LD/LN.Pos[.stVal]`) collapsed to its short segment(s):
 * - DOS → the DO name; SDS → the SDO name: the last data segment.
 * - DAS → the DA name: the last data segment when the parent DO is mapped, but
 *   `DO.DA` (the implementing DO carried along) when the parent DO is NOT mapped,
 *   so the DA's data object stays documented.
 *
 * The caller applies this only when the DOS/SDS/DAS itself is mapped by uuid; the
 * fully-unmapped LNode case (a full IED ObjectReference) is left intact.
 *
 * @returns the short name to store, or `undefined` to omit (clear) the attribute.
 */
export async function buildMappedName<GenericElement extends Scl.ElementsOf>(
	query: Core.Query<Config>,
	record: Scl.RawRecord<GenericElement>,
): Promise<string | undefined> {
	const spec = MAPPED_NAME_REFS.get(record.tagName)
	if (!spec) return undefined

	const specifiedName = record.attributes.find((a) => a.name === 'name')?.value
	if (!specifiedName) return undefined

	const currentValue = record.attributes.find((a) => a.name === spec.path)?.value
	const carryDataObject =
		record.tagName === 'DAS' && !(await isParentDataObjectMapped(query, record))
	const implementedName = extractName(currentValue, carryDataObject) ?? specifiedName

	return implementedName === specifiedName ? undefined : implementedName
}

/**
 * Extract the short name from a mapped-name value, tolerating both the conformant
 * short form and a legacy full ObjectReference (`IED/LD/LN.DO[.DA]`). Normally the
 * last data segment (the element's own name); when `carryDataObject` is set (an
 * unmapped parent DO), the whole `DO.DA` data chain is kept.
 */
function extractName(value: string | undefined, carryDataObject: boolean): string | undefined {
	if (!value) return undefined
	const { path, qualifier } = splitLnodeQualifier(value)
	const dataChain = qualifier ?? path
	if (carryDataObject) return dataChain || undefined
	const segments = dataChain.split('.')
	return segments[segments.length - 1] || undefined
}

/**
 * Whether the nearest enclosing data object (`DOS`/`SDS`) of a `DAS` is itself
 * mapped by uuid. When it is, the DO context is already documented on the parent
 * and the DAS need only carry the DA name; when it is not, the DAS must carry the
 * implementing `DO.DA`.
 */
async function isParentDataObjectMapped<GenericElement extends Scl.ElementsOf>(
	query: Core.Query<Config>,
	record: Scl.RawRecord<GenericElement>,
): Promise<boolean> {
	const ancestors = await query.findAncestors(record)
	const parent = ancestors.find((a) => a.tagName === 'DOS' || a.tagName === 'SDS')
	if (!parent) return false
	const mappedLnUuid = await query.getAttribute(
		{ tagName: parent.tagName, id: parent.id } as Scl.Ref<Scl.ElementsOf>,
		{ name: 'mappedLnUuid' },
	)
	return Boolean(mappedLnUuid)
}
