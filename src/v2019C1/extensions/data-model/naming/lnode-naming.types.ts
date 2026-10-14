/**
 * The `LNodeSpecNaming` an LNode that has none gets: its attributes, and whether they were derived
 * from the naming of the IED's logical node it is bound to rather than from a specification.
 */
export type SpecifiedNaming = {
	attributes: { name: string; value: string }[]
	derived: boolean
}
