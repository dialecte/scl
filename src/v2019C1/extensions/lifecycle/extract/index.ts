import * as extractTransaction from './transaction'

/**
 * Pull an element out of a document together with its reference/type closure.
 *
 * - `deep` — generic: clone an element subtree + its content-addressed type closure.
 * - `fsd` / `asd` — named recipes that place the result into a
 *   template Substation/VoltageLevel/Bay structure with FSD/ASD policy.
 */
export const extract = {
	transaction: extractTransaction,
}
