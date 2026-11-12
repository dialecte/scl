import { EXTRACTION_CONF_REV_INCREMENT, MAX_CONF_REV } from './extraction-conf-rev.constants'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'

import type { Scl } from '@/v2019C1/config'

/** Validate an affected source control's counter before any output writes, then compute its one increment. */
export function extractionConfRev(params: {
	source: Scl.Ref<'ReportControl' | 'GSEControl' | 'SampledValueControl'>
	value: string | undefined
}): string {
	const { source, value } = params
	const revision = value !== undefined && /^\d+$/.test(value) ? Number(value) : NaN
	if (!Number.isInteger(revision) || revision < 0 || revision > MAX_CONF_REV) {
		throwDialecteError(SCL_ERRORS.EXTRACTION_CONF_REV_INVALID, {
			ref: source,
			meta: { source, value },
			detail: 'extract.ied: an affected control requires an unsigned 32-bit confRev',
		})
	}
	if (revision > MAX_CONF_REV - EXTRACTION_CONF_REV_INCREMENT) {
		throwDialecteError(SCL_ERRORS.EXTRACTION_CONF_REV_OVERFLOW, {
			ref: source,
			meta: { source, value },
			detail: 'extract.ied: incrementing the affected control confRev would overflow',
		})
	}
	return String(revision + EXTRACTION_CONF_REV_INCREMENT)
}
