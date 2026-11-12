import type { Config, Scl } from '@/v2019C1/config'
import type { SourceFunctionRef } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { ResolvedMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'

export type CloneFunctionCategoriesParams = {
	sourceQuery: Core.Query<Config>
	functionRef: SourceFunctionRef
	structure: TargetStructure
	/** The key a project element carries a source element's uuid in, to find what it lands on. Default `templateUuid`. */
	matchKey?: MatchKey
	/**
	 * Where each category of the template lands, resolved before the operation wrote anything: see
	 * `resolveCategoryMappings`.
	 */
	categoryMappings: ResolvedMappings
	/**
	 * Where the categories this operation already placed landed, by source record id. Shared across
	 * the functions of one operation so that a category classifying several of them is placed once.
	 */
	placedCategories?: Map<string, Scl.Ref<'FunctionCategory'>>
}

export type CloneFunctionCategoriesResult = {
	/** Each source record that was cloned and the copy made of it. */
	cloneMappings: Scl.CloneMapping[]
	/** The categories and sub-categories that landed on one the target already holds. */
	redirectMappings: RedirectMapping[]
}
