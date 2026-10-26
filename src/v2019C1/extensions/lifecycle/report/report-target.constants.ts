import type { ReportTarget } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

/** Every field of a report's target, in the order a report applied to another target is told apart. */
const REPORT_TARGET_FIELD_ORDER = {
	document: true,
	source: true,
	verb: true,
	ref: true,
	anchor: true,
	scenario: true,
	targetInstance: true,
} as const satisfies Record<keyof ReportTarget, true>

/** The fields of a report's target, in the order a report applied to another target is told apart. */
export const REPORT_TARGET_FIELDS = Object.keys(REPORT_TARGET_FIELD_ORDER) as (keyof ReportTarget)[]
