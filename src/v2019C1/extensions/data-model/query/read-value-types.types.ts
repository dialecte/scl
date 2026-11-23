import type { AnyRawRecord } from '@dialecte/core'

/** What a value of an IED is held to, from the data attribute it is given for (a `DAI` overriding its type's). */
export type ValueDefinition = {
	valKind?: string
	/** The `DAI`'s effective `valImport` (`readValueImport`); absent on a data attribute's own definition. */
	imported?: boolean
	bType?: string
	type?: string
}

/** What the template's types tell of the values of an IED, read once: see `readValueOwnership`. */
export type ValueTypes = {
	/** The members of each type, by type id. */
	membersById: ReadonlyMap<string, ReadonlyMap<string, TypeMember>>
	/** The values each enumeration allows, by its id. */
	enumerationsById: ReadonlyMap<string, ReadonlySet<string>>
}

/** A member of a type: whether it continues the data object, the type it names, and what its values are held to. */
export type TypeMember = {
	/** The `DO` / `SDO` / `DA` / `BDA` itself. */
	record: AnyRawRecord
	continuesObject: boolean
	type?: string
	/** A data attribute's functional constraint. */
	fc?: string
	definition: ValueDefinition
}
