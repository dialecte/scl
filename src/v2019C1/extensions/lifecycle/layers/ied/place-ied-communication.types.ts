import type { Config, Scl } from '@/v2019C1/config'
import type { DiffPolicy } from '@/v2019C1/extensions/lifecycle/engine/diff-policy.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'

export type IedCommunicationParams = {
	sourceQuery: Core.Query<Config>
	/** The IED of the source file placed. */
	iedRef: Scl.Ref<'IED'>
	/** The root of the project the IED is placed under. */
	anchor: Scl.Ref<'SCL'>
	matchKey: MatchKey
	placeholderLineages?: PlaceholderLineages
}

export type ReadCommunicationOfParams = {
	/** The IED of the source file placed. */
	iedRef: Scl.Ref<'IED'>
}

export type DescribeIedCommunicationParams = IedCommunicationParams & { diffPolicy: DiffPolicy }
