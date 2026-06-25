import * as extractionTransaction from './transaction'

/**
 * Pull an element out of a document together with its reference/type closure.
 *
 * - `deep` — generic: clone an element subtree + its content-addressed type closure.
 * - `extractToFsd` / `extractToAsd` — named recipes that place the result into a
 *   template Substation/VoltageLevel/Bay structure with FSD/ASD policy.
 */
export const extraction = {
	transaction: extractionTransaction,
}
