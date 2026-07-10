import * as instantiateTransaction from './transaction'

/**
 * Instantiate template content into a target document — the inverse direction of
 * the extract recipes. Each recipe clones a template subtree with its type
 * closure and stamps instance lineage.
 *
 * - `fsd` — instantiate the Function carried by an FSD.
 */
export const instantiate = {
	transaction: instantiateTransaction,
}
