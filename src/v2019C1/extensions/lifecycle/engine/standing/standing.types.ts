import type { Scl } from '@/v2019C1/config'
import type { ReportInstance } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { DecisionMapping, DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * An element of a template that a container of that template REFERS TO without containing it (the
 * functions an application composes): each instance of the container needs its own in the project,
 * found or placed somewhere else in the project.
 */
export type StandingChild = {
	ref: Scl.Ref<Scl.ElementsOf> & { id: string }
	/** The value the project's elements of its lineage carry (its uuid). */
	lineage: string | undefined
}

/** What stands, for one instance of the container, for a child. */
export type Standing =
	/** What the instance already holds for it: its own, reconciled where each sits. */
	| { kind: 'owned'; elements: AnyTrackedRecord[] }
	/** The one element of that lineage no instance holds, where the instance lives: taken. */
	| { kind: 'taken'; element: AnyTrackedRecord }
	/** Nothing of that lineage where the instance lives: a new one is placed on `level`. */
	| { kind: 'placed'; level: Scl.Ref<Scl.ElementsOf> }
	/** Several of that lineage no instance holds, where the instance lives, none chosen yet. */
	| { kind: 'undecided' }

/** Several elements qualify for an instance: which one it stands on, or a new one, is the consumer's call. */
export type StandingChoice = {
	candidates: AnyTrackedRecord[]
	/** Where a new one is placed. */
	level: Scl.Ref<Scl.ElementsOf>
	/** The consumer's choice, when made. */
	decision?: DecisionMapping
}

/** A child, and what stands for it per instance of the container (by the instance's record id). */
export type ChildStandings = {
	child: StandingChild
	standings: Map<string, Standing>
	/** The instances for which the consumer chooses. */
	choices: Map<string, StandingChoice>
	/** The elements of that lineage no instance stands on, where the consumer started: reconciled. */
	unclaimed: AnyTrackedRecord[]
}

/**
 * What a layer tells the engine about the children its containers refer to; the engine keeps the
 * rule (see `resolveStandings`). Each function is asked per instance and child, so a layer answers
 * from what it read once per run.
 */
export type StandingPolicy = {
	/** What an instance already holds for a child: its own. */
	owned: (params: {
		instance: AnyTrackedRecord
		child: StandingChild
	}) => readonly AnyTrackedRecord[]
	/**
	 * Where an instance lives, for a child: where a free element of its lineage is looked for, and
	 * where a new one is placed. `undefined`: nowhere — nothing stands for it.
	 */
	levelOf: (params: {
		instance: AnyTrackedRecord
		child: StandingChild
	}) => Promise<Scl.Ref<Scl.ElementsOf> | undefined>
	/** The project's elements of a child's lineage under a level. */
	lineageAt: (params: {
		level: Scl.Ref<Scl.ElementsOf>
		child: StandingChild
	}) => Promise<AnyTrackedRecord[]>
	/** Where the consumer started, for a child — `undefined` when unknown. */
	anchorLevelOf?: (child: StandingChild) => Promise<Scl.Ref<Scl.ElementsOf> | undefined>
}

export type ResolveStandingsParams = {
	/** The instances of the container in the project. */
	instances: readonly AnyTrackedRecord[]
	children: readonly StandingChild[]
	policy: StandingPolicy
	/** The consumer's choices, keyed by `standingChoiceKey`. */
	decisionMappings?: DecisionMappings
}

/** A child placed for one instance of the container, as the report lists it. */
export type StandingPlacement = {
	/** The record id of the instance it is placed for. */
	placedFor: string
	/** The lineage the references to it carry. */
	lineage: string
	reportInstance: ReportInstance
}
