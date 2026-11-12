import type { Config, Scl } from '@/v2019C1/config'
import type { DecisionMappings, ResolvedMapping } from '@/v2019C1/extensions/lifecycle/mapping'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'

export type ResolveRoleMappingsParams = {
	sourceQuery: Core.Query<Config>
	/** The applications the placement places. */
	applicationRefs: readonly Scl.Ref<'Application'>[]
	/** The consumer's choices for the shared elements the applications refer to. */
	decisionMappings?: DecisionMappings
	/** The key a project element carries a source element's uuid in. Default `templateUuid`. */
	matchKey?: MatchKey
	/** Where the levels of the template land on elements the project holds: a role is found by name only there. */
	landings: readonly RedirectMapping[]
}

/** A source AllocationRole an application refers to, and where it lands in the project. */
export type ResolvedRole = {
	sourceRef: Scl.Ref<'AllocationRole'> & { id: string }
	sourceUuid: string
	mapping: ResolvedMapping
}

/** Where the roles each application refers to land, by the record id of the source application. */
export type RoleMappings = ReadonlyMap<string, readonly ResolvedRole[]>
