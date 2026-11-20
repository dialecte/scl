import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'

import type { LifecycleRefusal, Refused } from './refusal.types'

/** A check's refusal, as data. */
export function refuse(refusal: LifecycleRefusal): Refused {
	return { refused: refusal }
}

/** Whether a check's answer is a refusal. */
export function isRefused<GenericValue>(answer: GenericValue | Refused): answer is Refused {
	return typeof answer === 'object' && answer !== null && 'refused' in answer
}

/** Throw a refusal as the error it names, with its meta and detail. */
export function throwRefusal(refusal: LifecycleRefusal): never {
	return throwDialecteError(SCL_ERRORS[refusal.code], {
		meta: refusal.meta,
		detail: refusal.detail,
	})
}

/** A check's answer, its refusal thrown: what a verb reads. */
export function orThrowRefusal<GenericValue>(answer: GenericValue | Refused): GenericValue {
	if (isRefused(answer)) return throwRefusal(answer.refused)
	return answer
}
