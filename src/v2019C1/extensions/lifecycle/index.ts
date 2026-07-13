import { apply } from './apply'
import * as extractTransaction from './extract/transaction'
import * as instantiateTransaction from './instantiate/transaction'
import { report } from './report'
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
 *
 * Two-track seam (verb-agnostic, ENGINE.md §6): `query.lifecycle.report({ verb,
 * sourceQuery, ref, anchor })` classifies, then `tx.lifecycle.apply(tx, { ...,
 * report })` applies the fast track headless (full track returns the report for
 * decision review — nothing is written until decisions come back).
 */
export const lifecycle = {
	query: {
		update: updateQuery,
		report,
	},
	transaction: {
		extract: extractTransaction,
		instantiate: instantiateTransaction,
		transplant: { deep },
		update: updateTransaction,
		apply,
	},
}
