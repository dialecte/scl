import type { DecisionRequiredReason, KeptTextChange, TextChange } from './diff.types'

/** A value of the template the project may set: the values its enumeration allows, when it has one. */
export type SettableValue = { allowed?: ReadonlySet<string> }

/** Per template `Val` record id, what the project may do with it: only the values it may set are listed. */
export type SettableValues = ReadonlyMap<string, SettableValue>

/** What a value of an IED is held to, from the data attribute it is given for (a `DAI` overriding its type's). */
export type ValueDefinition = {
	valKind?: string
	valImport?: string
	bType?: string
	type?: string
}

/** Where a walk down an IED's data stands in the types: a logical node, a data object or a data attribute type. */
export type TypeContext = { kind: 'logical-node' | 'object' | 'attribute'; id: string }

/** What the template's types tell of the values of an IED, read once: see `readSettableValues`. */
export type ValueTypes = {
	/** The members of each type, by type id. */
	membersById: ReadonlyMap<string, ReadonlyMap<string, TypeMember>>
	/** The values each enumeration allows, by its id. */
	enumerationsById: ReadonlyMap<string, ReadonlySet<string>>
}

/** A member of a type: whether it continues the data object, the type it names, and what its values are held to. */
export type TypeMember = { continuesObject: boolean; type?: string; definition: ValueDefinition }

/** What the project keeps of a template's values, for one report or apply. */
export type ValueOwnership = {
	settableValues: SettableValues
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
