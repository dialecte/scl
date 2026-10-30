/** One finding of the XSD validator on a document. */
export type SclXsdViolation = {
	/** The validator's message, without position: it names the element, the attribute or the constraint. */
	message: string
	/** Where it is, as the validator writes it (positional), when it says. */
	xpath?: string
}

/** The Header given to a test document that has none: its `id` and `uuid`. */
export type SuppliedHeader = {
	readonly id: string
	readonly uuid: string
}

export type CollectSclXsdViolationsParams = {
	xml: string
	/**
	 * The Header to give the parsed document when it has none, before it is validated (a hand-made test document):
	 * without one the validator checks nothing past the root's first child. The text itself is left as it is.
	 */
	missingHeader?: SuppliedHeader
}

/**
 * Where the schema files are: a URL the test's browser fetches each file of `SCL_XSD_FILE_NAMES` from, or a loader
 * giving their texts by file name. Read once per worker, on the first validation.
 */
export type SclXsdSchemaSource =
	| { baseUrl: string }
	| { load: () => Promise<Readonly<Record<string, string>>> }

/** What the XSD validator gave: whether it ran (the schema files are configured) and its findings. */
export type SclXsdReport = { ran: false } | { ran: true; violations: SclXsdViolation[] }
