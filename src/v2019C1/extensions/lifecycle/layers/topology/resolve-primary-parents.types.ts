import type { InstanceLevels } from './resolve-instance-levels.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

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
	/**
	 * The instances the operation is scoped to (those one IED's specification holds): the primary is held when one of
	 * them is an instance of it, another placement's instance telling nothing. Absent: any instance in the project.
	 */
	primaryTargets?: readonly Scl.Ref<Scl.ElementsOf>[]
	/**
	 * The one instance of the unit (the level it sits on) a primary the template gained is placed in, when the operation
	 * names one (an IED's specification on several bays). Absent: one placement per instance.
	 */
	gainedIn?: Scl.Ref<Scl.ElementsOf>
}

/** A primary of the scope as the template holds it: read once per update, for every resolution of it. */
export type TemplatePrimary = {
	ref: Scl.Ref<'Application'> | Scl.Ref<'Function'>
	/** Its uuid in the template: what its instances in the project carry as their lineage. */
	uuid: string | undefined
	/** Its ancestors in the template, nearest first, up to the Substation. */
	ancestors: readonly AnyTrackedRecord[]
}

/** Every primary of a pass resolved at once, from the template's reads of them. */
export type ResolvePrimaryParentsOfEachParams = Omit<
	ResolvePrimaryParentsParams,
	'sourceQuery' | 'primaryRef'
> & {
	primaries: readonly TemplatePrimary[]
	/** Whether the held instances' moves are read (the move pass): without, `moves` is empty. */
	withMoves: boolean
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
	/** The held instances the revision puts on another level of their instance of the unit: one per instance moved. */
	moves: PrimaryMove[]
}

/** A held instance of a primary the revision puts on another level of its instance of the unit. */
export type PrimaryMove = {
	instance: Scl.Ref<'Application'> | Scl.Ref<'Function'>
	/** The level it is held on now. */
	from: Scl.Ref<Scl.ElementsOf>
	/** The level the revision puts it on; absent when that level is gained, created by this update (`toSource`). */
	to?: Scl.Ref<Scl.ElementsOf>
	/** The template's level it is put on. */
	toSource: Scl.Ref<Scl.ElementsOf>
	/** The level the instance of the unit sits on: what the report lists the move for. */
	placedFor: Scl.Ref<Scl.ElementsOf>
	/** The ids above the instance, its level first: a removal of one of them waits for the move. */
	fromChain: readonly string[]
}

/** The held instances of a primary, where the template puts it, and where each instance of the unit stands. */
export type FindPrimaryMovesParams = {
	held: readonly AnyTrackedRecord[]
	/** The ancestors of each held instance, in the order of `held`, nearest first. */
	ancestries: readonly (readonly AnyTrackedRecord[])[]
	/** The primary's ancestors in the template, nearest first. */
	sourceAncestors: readonly AnyTrackedRecord[]
	unitId: string
	instanceLevelsList: readonly InstanceLevels[]
}
