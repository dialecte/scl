import type { Scl } from '@/v2019C1/config'
import type { ApplyResult } from '@/v2019C1/extensions/lifecycle/apply/apply.types'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'

export type ReportAndApplyParams = {
	/** The project document the lifecycle writes to. */
	document: Scl.Document
	/** What to report, then apply. */
	lifecycle: LifecycleTarget
	/** The consumer's decisions, read from the report. Default: none taken, every group at its suggested action. */
	decide?: (report: DiffReport) => DecisionMap
	/** Apply with no decisions at all, as a headless caller does. */
	withoutDecisions?: boolean
	/** Where the consumer chose the template's elements land, given to the report and the apply. */
	mappings?: DecisionMappings
}

/** What one report-then-apply gave: the report the consumer read, and what the apply wrote. */
export type ReportedAndApplied = {
	report: DiffReport
	applied: ApplyResult
}

export type ForkInTurnParams = Omit<ReportAndApplyParams, 'withoutDecisions'> & {
	/** How many times the same revision is forked, one apply after the other. */
	turns: number
}

/** A decision group as a snapshot reads it: what changes, on which element (by its uuid or name), and how. */
export type DescribedGroup = {
	change: string
	tagName: string
	element: string | undefined
	attributeChanges?: string[]
	companions: string[]
}
