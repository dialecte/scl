/** An element sought by the uuid it carries, among tags tried in order. */
export type TargetSought = {
	/** The uuid sought; `''` seeks nothing. */
	uuid: string
	/** The tags it may carry, the first tried first. */
	targetTagNames: readonly string[]
}
