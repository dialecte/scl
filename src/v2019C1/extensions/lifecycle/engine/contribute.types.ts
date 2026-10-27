import type { ContributionScope } from './contribution-scope.types'
import type { PlaceholderLineages } from './placeholder-lineages.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'

/** What `contribute` writes and `describeContribution` reads. */
export type ContributionParams = {
	/** The document the source element is read in: the template, or the project itself for a copy. */
	sourceQuery: Core.Query<Config>
	/** The source element the project shares: a role, a category, a level's own content. */
	source: Scl.Ref<Scl.ElementsOf>
	/** The element of the project it lands on. */
	target: Scl.Ref<Scl.ElementsOf>
	/** What the source's references may name: what the placement places (see `ContributionScope`). */
	scope: ContributionScope
	/** The key a project element carries a source element's uuid in. */
	matchKey: MatchKey
	/** Source elements placed onto elements the project holds: a reference to one names that element. */
	redirectMappings?: readonly RedirectMapping[]
	/** The source elements the consumer left out (record ids), with what they hold. */
	leftOut?: ReadonlySet<string>
	/** Child tags another pass places (a level's structural children, its functions and applications). */
	omit?: readonly string[]
	/** The lineages a reference of the project may pair by name on: see `PlaceholderLineages`. */
	placeholderLineages?: PlaceholderLineages
	/** The source is the project itself (a copy): a reference naming an element the copy is made from is a new one. */
	sourceIsProject?: boolean
}

/**
 * What a contribution wrote: each source record it added and the copy made of it, and where the source element and its
 * identified elements landed on elements the project holds — a reference to one of them names that element.
 */
export type ContributeResult = {
	cloneMappings: Scl.CloneMapping[]
	redirectMappings: RedirectMapping[]
}
