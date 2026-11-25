import { throwDialecteError } from '@dialecte/core'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** The name of the IED an export selects: refused when the source holds no such IED, or one without a name. */
export async function readSelectedIedName(
	query: Core.Query<Config>,
	params: { iedRef: Scl.Ref<'IED'> },
): Promise<string> {
	const { iedRef } = params
	const source = await query.getRecord(iedRef)
	if (!source) {
		throwDialecteError('ELEMENT_NOT_FOUND', {
			ref: iedRef,
			detail: 'extract.ied: selected source IED not found',
		})
	}
	const iedName = await query.getAttribute(iedRef, { name: 'name' })
	if (!iedName) {
		throwDialecteError('ASSERTION_FAILED', {
			ref: iedRef,
			detail: 'extract.ied: selected source IED has no name',
		})
	}
	return iedName
}
