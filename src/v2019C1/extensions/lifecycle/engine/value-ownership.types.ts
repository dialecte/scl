import type { DecisionRequiredReason, KeptTextChange, TextChange } from './diff.types'

/** A value of the template the project may set: the values its enumeration allows, when it has one. */
export type SettableValue = { allowed?: ReadonlySet<string> }

/** Per template `Val` record id, what the project may do with it: only the values it may set are listed. */
export type SettableValues = ReadonlyMap<string, SettableValue>

/** Where a walk down an IED's data stands in the types: a logical node, a data object or a data attribute type. */
export type TypeContext = { kind: 'logical-node' | 'object' | 'attribute'; id: string }

/** What the project keeps of a template's values, for one report or apply. */
export type ValueOwnership = {
	settableValues: SettableValues
	/** The data instances of the project naming data the template's type no longer holds: see `readLostDataInstances`. */
	lostData: ReadonlySet<string>
	/** The project elements whose kept value the consumer takes the template's for: see `resolveTakeOvers`. */
	takeOver: TakenOver
}

/** A matched element's text compared, as the report lists it and the apply writes it. */
export type TextComparison = {
	textChange?: TextChange
	keptTextChange?: KeptTextChange
	takenOver?: true
	requiresDecision?: DecisionRequiredReason
}

/** The values a consumer takes over in one subtree of the project: every one (`all`), or those of the elements `ids`. */
export type TakenOver = { all: boolean; ids: ReadonlySet<string> }
