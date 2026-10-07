import type { InstanceLevels } from './resolve-instance-levels.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
import type * as Core from '@dialecte/core'

export type ResolvePrimaryParentsParams = {
	sourceQuery: Core.Query<Config>
	primaryRef: Scl.Ref<'Application'> | Scl.Ref<'Function'>
	/** The element of the project the consumer started from. */
	anchor: Scl.Ref<Scl.ElementsOf>
	/** The record id of the template's unit: each instance's levels name the level it sits on by it. */
	unitId: string
	/** Where each instance of the unit lives, level by level. */
	instanceLevelsList: readonly InstanceLevels[]
	matchKey: MatchKey
}

/** One place a primary of a topology unit is placed or reconciled under. */
export type PrimaryPlace = {
	/**
	 * The level of the project it lands under. Undefined while that level is not written: the
	 * template gained it and this update creates it, or the consumer left it out.
	 */
	parent?: Scl.Ref<Scl.ElementsOf>
	/**
	 * For a primary the template gained, the instance of the unit it is placed in — the level that
	 * instance sits on, the same before and after the write: what the report lists it for.
	 */
	placedFor?: Scl.Ref<Scl.ElementsOf>
}

/** Where a primary of a topology unit is placed or reconciled. */
export type PrimaryParents = {
	/** One per instance of the unit when gained; else the element the consumer started from. */
	places: PrimaryPlace[]
	/** The template gained it: the project holds no instance of it yet. */
	gained: boolean
}
