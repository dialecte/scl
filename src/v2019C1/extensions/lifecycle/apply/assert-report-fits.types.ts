import type { IedCollisions } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

export type AssertReportCollisionsParams = {
	/** The report the placement was given, if any. */
	report: DiffReport | undefined
	/** What the placement does with a taken name, resolved. */
	collisions: IedCollisions
}
