import type { Config } from '@/v2019C1/config'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'

export type ResolveCategoryMappingsParams = {
	sourceQuery: Core.Query<Config>
	/** The consumer's choices for the categories, by source record id. */
	decisionMappings?: DecisionMappings
	/** The key a project element carries a source element's uuid in. Default `templateUuid`. */
	matchKey?: MatchKey
	/** Where the levels of the template land on elements the project holds: a category is found by name only there. */
	landings: readonly RedirectMapping[]
}
