import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'

import type { CommitRefusal } from './commit-plan.types'

/**
 * Throw a refusal of the commit with its own key, code, meta and detail: the one throw of every refusal the commit
 * also lists as data, so the error thrown and the refusal listed never differ.
 */
export function refuseWith(params: { refusal: CommitRefusal }): never {
	const { refusal } = params
	return throwDialecteError(SCL_ERRORS[refusal.key], {
		meta: refusal.meta,
		detail: refusal.detail,
	})
}
