import type { Config, Scl } from '@/v2019C1/config'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

export type ResolveSharedFunctionsParams = {
	sourceQuery: Core.Query<Config>
	/** The functions the application composes that its placement writes. */
	functionRefs: readonly Scl.Ref<'Function'>[]
	/** Where the placement lands: a function is looked for, and placed, at the level its template says. */
	structure: TargetStructure
	/** The level the application lands on: what the choice of a function is made for. */
	placedFor: AnyTrackedRecord
	/** The consumer's choices, keyed by `standingChoiceKey`. */
	decisionMappings?: DecisionMappings
	/** The key a project function carries a template function's uuid in. */
	matchKey: MatchKey
}
