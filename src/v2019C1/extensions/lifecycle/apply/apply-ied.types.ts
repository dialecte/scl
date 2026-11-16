import type { LifecycleApplyParams } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'

export type ApplyIedParams = {
	/** What the report was made for: an IED of a source file and the project's root. */
	target: Extract<LifecycleApplyParams, { verb: 'ied' }>
	report: DiffReport
	decisions: DecisionMap
	placeholderLineages: PlaceholderLineages
}
