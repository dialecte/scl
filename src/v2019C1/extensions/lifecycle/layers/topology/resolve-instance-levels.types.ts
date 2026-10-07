import type { Config, Scl } from '@/v2019C1/config'
import type { DecisionMapping, DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
import type * as Core from '@dialecte/core'

/** A structural level of the template, as every instance reads it. */
export type TemplateFrameElement = {
	ref: Scl.Ref<Scl.ElementsOf> & { id: string }
	/** Its structural ancestors' record ids, nearest first. */
	ancestorIds: readonly string[]
	uuid: string | undefined
	/** A level above the unit: the project's context, which the template gives nothing to. */
	context: boolean
}

/** The structural levels of a template's unit, top-down, read once for all its instances. */
export type TemplateFrame = {
	/** The unit of the template: the first named level. */
	scopeRef: Scl.Ref<Scl.ElementsOf> & { id: string }
	elements: readonly TemplateFrameElement[]
}

export type ResolveInstanceLevelsParams = {
	sourceQuery: Core.Query<Config>
	/** The template's levels, read once (`resolveTemplateFrame`). */
	templateFrame: TemplateFrame
	/** The level of the project the instance of the unit sits on. */
	frameInstance: Scl.Ref<Scl.ElementsOf>
	matchKey?: MatchKey
	/**
	 * The consumer's choices: a level the template gained, mapped onto a level of the project for
	 * this instance (keyed by `standingChoiceKey` of the instance and the source level), stands on it.
	 */
	decisionMappings?: DecisionMappings
}

/**
 * A level of the unit the instance holds nothing for, below a level it does hold: the template gained
 * it since the instance was placed. Where it lands, for that instance, is the consumer's call
 * (created by default).
 */
export type GainedLevel = {
	sourceRef: Scl.Ref<Scl.ElementsOf> & { id: string }
	/** The level of the project it lands under: the one the instance holds for the level above. */
	parentLevel: Scl.Ref<Scl.ElementsOf>
	/** The key of the consumer's choice for it, for this instance. */
	choiceKey: string
	/** The consumer's choice, when made. */
	decision?: DecisionMapping
}

/** A level of the template the instance already stands on, as an earlier placement left it. */
export type HeldLevel = {
	sourceRef: Scl.Ref<Scl.ElementsOf> & { id: string }
	/** The level of the project it stands on. */
	level: Scl.Ref<Scl.ElementsOf>
	/** The held level above it, by its source record id — none for the topmost. */
	parentSourceId?: string
	/** The level is the project's own (reused), not one created from the template's level. */
	projectOwned: boolean
}

/** Where each level of the unit stands for one instance, and what the template gained since. */
export type InstancePlacement = {
	/** By source record id: the level each stands on, `undefined` when new to the instance. */
	levels: InstanceLevels
	/** The levels the instance stands on, top-down — the levels above the unit included. */
	held: HeldLevel[]
	gained: GainedLevel[]
}

/**
 * The level of the project each level of a template's unit stands on, for one instance — by the
 * record id of the source level. `undefined`: the instance holds no level for it.
 */
export type InstanceLevels = ReadonlyMap<string, Scl.Ref<Scl.ElementsOf> | undefined>
