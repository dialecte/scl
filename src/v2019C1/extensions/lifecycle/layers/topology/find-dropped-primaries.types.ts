import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord, AnyTrackedRecord } from '@dialecte/core'

export type FindDroppedPrimariesParams = {
	sourceQuery: Core.Query<Config>
	/** The unit of the newer template, or revision: its first named level. */
	scopeRef: Scl.Ref<TopologyStructuralTag>
	/** A level of the project an instance of the unit sits on. */
	frameInstance: AnyRefOrRecord
	/** The scenario's key an element of the project carries its source element's uuid in. */
	matchKey: MatchKey
	/** What tells a primary the source dropped from one the project added: see `classifyUnmatched`. */
	removalBase: RemovalBase
}

/** What the levels of a unit's instance hold: the applications, then the functions. */
export type UnitPrimaries = {
	applications: AnyTrackedRecord[]
	functions: AnyTrackedRecord[]
}

/** The uuids of the newer unit: its root level, its levels, its primaries (applications, functions). */
export type UnitUuids = {
	root: string | undefined
	levels: Set<string>
	primaries: Set<string>
}
