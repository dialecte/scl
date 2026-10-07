import type { Config, Scl } from '@/v2019C1/config'
import type { DecisionMapping, DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

export type ResolveComposedFunctionsParams = {
	sourceQuery: Core.Query<Config>
	applicationRef: Scl.Ref<'Application'>
	/** The instances of the application in the project. */
	applicationInstances: readonly AnyTrackedRecord[]
	/** The element of the project the consumer started from, when known. */
	anchor?: Scl.Ref<Scl.ElementsOf>
	matchKey: MatchKey
	/**
	 * The consumer's choices, among them which function an instance stands on where several qualify,
	 * keyed by {@link composedFunctionChoiceKey}.
	 */
	decisionMappings?: DecisionMappings
}

/** What stands, for one instance of the application, for a function its template composes. */
export type ComposedFunctionStanding =
	/** The functions the instance refers to: its own, each reconciled where it sits. */
	| { kind: 'owned'; functions: AnyTrackedRecord[] }
	/** The one function of that lineage no instance refers to, where the instance lives: taken. */
	| { kind: 'taken'; function: AnyTrackedRecord }
	/** Nothing of that lineage where the instance lives: a new one is placed there, on `level`. */
	| { kind: 'placed'; level: Scl.Ref<Scl.ElementsOf> }
	/** Several of that lineage no instance refers to, where the instance lives, none chosen yet: nothing written. */
	| { kind: 'undecided' }

/**
 * Where an instance lives, several functions of that lineage no instance refers to qualify: which one
 * it stands on — or a new one — is the consumer's to choose.
 */
export type ComposedFunctionChoice = {
	candidates: AnyTrackedRecord[]
	/** Where a new one is placed. */
	level: Scl.Ref<Scl.ElementsOf>
	/** The consumer's choice, when made. */
	decision?: DecisionMapping
}

/** One function the template of the application composes, and what stands for it in the project. */
export type ComposedFunction = {
	functionRef: Scl.Ref<'Function'>
	sourceUuid: string | undefined
	/** By the record id of each instance of the application. */
	standings: Map<string, ComposedFunctionStanding>
	/** The instances for which it is the consumer's to choose, by their record id. */
	choices: Map<string, ComposedFunctionChoice>
	/** The functions of that lineage no instance refers to, where the consumer started. */
	atAnchor: AnyTrackedRecord[]
}
