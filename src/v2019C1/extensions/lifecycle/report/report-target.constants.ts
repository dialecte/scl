import type { ReportTarget } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclFileExtension } from '@/v2019C1/extensions/lifecycle/source-file-type.types'

/** Every field of a report's target, in the order a report applied to another target is told apart. */
const REPORT_TARGET_FIELD_ORDER = {
	document: true,
	source: true,
	verb: true,
	ref: true,
	anchor: true,
	scenario: true,
	targetInstance: true,
	fileType: true,
} as const satisfies Record<keyof ReportTarget, true>

/** The fields of a report's target, in the order a report applied to another target is told apart. */
export const REPORT_TARGET_FIELDS = Object.keys(REPORT_TARGET_FIELD_ORDER) as (keyof ReportTarget)[]

/** The source extensions an IED is placed from: an ISD, an ICD, an IID, or an SCD (`.scd`, `.xml`, or no extension). */
export const IED_SOURCE_EXTENSIONS: ReadonlySet<SclFileExtension> = new Set<SclFileExtension>([
	'.isd',
	'.icd',
	'.iid',
	'.scd',
	'.xml',
	'',
])
