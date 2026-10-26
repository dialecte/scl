export type PruneEmptyContainersParams = {
	/**
	 * The staged operation the transaction's own changes start at: only the containers it emptied or created since are
	 * judged — the parent of an element it deleted, an element it created or updated. Absent: every container of the
	 * document.
	 */
	from?: number
}
