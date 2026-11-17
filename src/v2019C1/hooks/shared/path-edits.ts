/**
 * The path edits of a transaction, by the transaction's query: an edit of the path of a reference holding a uuid is
 * resolved at the commit (the element it names may come later in the transaction). Every hook of one transaction is
 * given the same query, so the commit reads what the updates noted, and nothing outlives the transaction.
 */
const editedByQuery = new WeakMap<object, Map<string, Set<string>>>()

/** Note that a reference holding a uuid had the path of one of its pairs edited, to be resolved at the commit. */
export function notePathEdit(params: {
	query: object
	recordId: string
	pathAttribute: string
}): void {
	const { query, recordId, pathAttribute } = params
	const noted = editedByQuery.get(query) ?? new Map<string, Set<string>>()
	noted.set(recordId, (noted.get(recordId) ?? new Set<string>()).add(pathAttribute))
	editedByQuery.set(query, noted)
}

/** The references holding a uuid whose path the transaction's updates edited: the path attributes edited, by record id. */
export function pathEdits(params: { query: object }): ReadonlyMap<string, ReadonlySet<string>> {
	return editedByQuery.get(params.query) ?? new Map()
}
