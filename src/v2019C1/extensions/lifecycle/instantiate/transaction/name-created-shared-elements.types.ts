import type { Config, Scl } from '@/v2019C1/config'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'

export type NameCreatedSharedElementsParams = {
	sourceQuery: Core.Query<Config>
	/** What the operation cloned: the shared elements among them are the ones it created. */
	cloneMappings: readonly Scl.CloneMapping[]
	/** The structure the operation places its elements in. */
	structure: TargetStructure
	/** The consumer's choices, by source record id. */
	decisionMappings?: DecisionMappings
}
