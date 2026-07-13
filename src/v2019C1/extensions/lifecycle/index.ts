import * as extractTransaction from './extract/transaction'
import * as instantiateTransaction from './instantiate/transaction'
import { deep } from './transplant/transaction'
import * as updateQuery from './update/query'
import * as updateTransaction from './update/transaction'

/**
 * SCL content lifecycle — the verbs that move template/instance content across
 * documents, grouped under a single `lifecycle` module so consumers get one
 * stable, discoverable surface: `tx.lifecycle.<verb>.<recipe>` /
 * `query.lifecycle.<verb>.<recipe>`.
 *
 * - `extract`     — pull an element out into a template FSD/ASD
 *                   (`tx.lifecycle.extract.fsd` / `.asd` /
 *                   `.ensureSubstationTemplateStructure`).
 * - `instantiate` — instantiate template content into a project
 *                   (`tx.lifecycle.instantiate.fsd` / `.asd`).
 * - `transplant`  — generic clone/graft engine (`tx.lifecycle.transplant.deep`).
 * - `update`      — instantiate-or-reconcile a project against a newer template:
 *                   `tx.lifecycle.update.fsd` / `.asd` apply the change;
 *                   `query.lifecycle.update.reportFsd` / `.reportAsd` preview a
 *                   `DiffReport` (fast/full classification) read-only.
 */
export const lifecycle = {
	query: {
		update: updateQuery,
	},
	transaction: {
		extract: extractTransaction,
		instantiate: instantiateTransaction,
		transplant: { deep },
		update: updateTransaction,
	},
}
