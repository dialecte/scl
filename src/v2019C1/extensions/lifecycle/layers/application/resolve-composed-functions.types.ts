import type { Config, Scl } from '@/v2019C1/config'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

export type ResolveComposedFunctionsParams = {
	sourceQuery: Core.Query<Config>
	applicationRef: Scl.Ref<'Application'>
	/** The instances of the application in the project. */
	applicationInstances: readonly AnyTrackedRecord[]
	/** The element of the project the consumer started from, when known. */
	anchor?: Scl.Ref<Scl.ElementsOf>
	matchKey: MatchKey
	/** The consumer's choices, among them which function an instance stands on where several qualify. */
	decisionMappings?: DecisionMappings
}
