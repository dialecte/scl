import type { Config, Scl } from '@/v2019C1/config'
import type { DecisionMappings, ReportMapping } from '@/v2019C1/extensions/lifecycle/mapping'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'

/**
 * What a first placement merging shared functions lists: the mappings of the functions stood on or to choose, the
 * functions it places, and where those it stands on are (a reference to one names that function).
 */
export type ReportedSharedFunctions = {
	mappings: ReportMapping[]
	placed: Scl.Ref<'Function'>[]
	taken: RedirectMapping[]
}

/** What the report of a first placement merging shared functions reads. */
export type ReportSharedFunctionsParams = {
	sourceQuery: Core.Query<Config>
	applicationRef: Scl.Ref<'Application'>
	functionRefs: readonly Scl.Ref<'Function'>[]
	/** Where the application lands. */
	anchor: Scl.Ref<Scl.ElementsOf> | undefined
	decisionMappings?: DecisionMappings
	matchKey: MatchKey
}
