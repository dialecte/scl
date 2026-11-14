/**
 * The `LNodeSpecNaming` an LNode that has none gets: its attributes, and whether they were derived
 * from the naming of the IED's logical node it is bound to rather than from a specification.
 */
export type SpecifiedNaming = {
	attributes: { name: string; value: string }[]
	derived: boolean
}

/** The specification IED an LNode is specified on: its name, and the logical device it names in it. */
export type SpecificationIed = {
	iedName: string
	ldInst: string | undefined
}

/** The logical node of a specification IED a released LNode goes back to; its uuid when it has one. */
export type SpecificationLogicalNode = {
	uuid: string | undefined
}
