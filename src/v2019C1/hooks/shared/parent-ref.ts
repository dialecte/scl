import { throwDialecteError } from '@dialecte/core'
import { toRef } from '@dialecte/core/helpers'

import type { Scl } from '@/v2019C1/config'
import type { AnyRawRecord } from '@dialecte/core'

/** The ref of a stored record's parent (a behaviour variable's BehaviorDescription): one always exists, `caller` says who asked. */
export function parentRefOf(params: {
	record: AnyRawRecord
	caller: string
}): Scl.Ref<Scl.ElementsOf> {
	const { record, caller } = params
	const { parent } = record
	if (!parent) {
		return throwDialecteError('ASSERTION_FAILED', {
			detail: `${caller}: the ${record.tagName} "${record.id}" has no parent`,
		})
	}
	return toRef(parent) as Scl.Ref<Scl.ElementsOf>
}
