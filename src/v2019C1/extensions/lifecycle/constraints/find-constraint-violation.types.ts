/** A scoped-uniqueness constraint declared on a parent element (from the schema). */
export type SchemaConstraint = {
	kind: string
	name: string
	selector?: { steps?: { kind: string; value?: string }[] }[]
	fields?: { target?: { value?: string } }[]
}

/** A detected violation: the constraint broken and the existing child it collides with. */
export type ConstraintViolation = {
	/** The violated constraint's name (e.g. `uniqueChildNameInBay`). */
	constraint: string
	/** The key fields the constraint compares (e.g. `['name']`). */
	fields: string[]
	/** The id of the existing sibling the candidate collides with. */
	offendingId: string
}
