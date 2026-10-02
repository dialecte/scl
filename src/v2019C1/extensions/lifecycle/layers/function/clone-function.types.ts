import type { Config, Scl } from '@/v2019C1/config'
import type { SourceFunctionRef } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'

export type CloneFunctionCategoriesParams = {
	sourceQuery: Core.Query<Config>
	functionRef: SourceFunctionRef
	structure: TargetStructure
	stripCategoriesUuid?: boolean
	/** The consumer's choices for the categories, by source record id. */
	decisionMappings?: DecisionMappings
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
