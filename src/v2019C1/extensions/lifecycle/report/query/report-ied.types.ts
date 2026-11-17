import type { Config, Scl } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffPolicy } from '@/v2019C1/extensions/lifecycle/engine/diff-policy.types'
import type { InstanceDiff } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { DecisionMappings, ReportPass } from '@/v2019C1/extensions/lifecycle/mapping'
import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'
import type * as Core from '@dialecte/core'

export type ReportIedParams = {
	sourceQuery: Core.Query<Config>
	iedRef: Scl.Ref<'IED'>
	/** The root of the project the IED is placed under. */
	anchor: Scl.Ref<'SCL'>
	scenario?: LifecycleScenario
	/** The type of file the source is, from its extension. */
	fileType: SclFileType | undefined
	diffPolicy: DiffPolicy
	placeholderLineages?: PlaceholderLineages
	/** The consumer's choices for the specification the file carries: where each of its levels lands. */
	decisionMappings?: DecisionMappings
	/** What the whole report already listed and named. */
	pass?: ReportPass
	/** The IED of the project an update starts from: required when the project holds several instances. */
	targetInstance?: Scl.Ref<'IED'>
	/** What tells an element the template dropped from one the project added, read once for the whole report. */
	removalBase: RemovalBase
}

export type WithCompanionParams = {
	instanceDiff: InstanceDiff
	iedRef: Scl.Ref<'IED'>
	/** What the IED's Communication part adds to the project's, when the source holds one for it. */
	companion: InstanceDiff | undefined
}
