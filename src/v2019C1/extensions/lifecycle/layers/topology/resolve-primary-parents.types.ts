import type { InstanceLevels } from './resolve-instance-levels.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
import type * as Core from '@dialecte/core'

export type ResolvePrimaryParentsParams = {
	sourceQuery: Core.Query<Config>
	primaryRef: Scl.Ref<'Application'> | Scl.Ref<'Function'>
	/** The element of the project the consumer started from. */
	anchor: Scl.Ref<Scl.ElementsOf>
	/** Where each instance of the unit lives, level by level. */
	instanceLevelsList: readonly InstanceLevels[]
	matchKey: MatchKey
}

/** Where a primary of a topology unit is placed or reconciled. */
export type PrimaryParents = {
	/** The elements of the project it is updated under: one per instance of the unit when gained. */
	parents: Scl.Ref<Scl.ElementsOf>[]
	/** The template gained it: the project holds no instance of it yet. */
	gained: boolean
}
