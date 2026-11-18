import { MAX_CONF_REV } from './extraction-conf-rev.constants'

import type { NextConfRev } from './conf-rev.types'

/**
 * A control block's next configuration revision, `step` above `value`: refused when `value` is no unsigned 32-bit
 * counter (`invalid`) or the step would pass its limit (`overflow`). Pure: each caller says what a refusal means.
 */
export function nextConfRev(params: { value: string | undefined; step: number }): NextConfRev {
	const { value, step } = params
	const revision = value !== undefined && /^\d+$/.test(value) ? Number(value) : NaN
	if (!Number.isInteger(revision) || revision < 0 || revision > MAX_CONF_REV) {
		return { refusal: 'invalid' }
	}
	if (revision > MAX_CONF_REV - step) return { refusal: 'overflow' }
	return { next: String(revision + step) }
}
