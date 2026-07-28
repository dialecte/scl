import { apply } from './apply'
import * as extractTransaction from './extract'
import * as instantiateTransaction from './instantiate'
import { report } from './report'
import { deep } from './transplant'
import * as updateTransaction from './update'
import { checkTemplateUuids } from './validate'

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
 * - `transplant`  — generic clone engine (`tx.lifecycle.transplant.deep`).
 * - `update`      — instantiate-or-reconcile a project against a newer template
 *                   (`tx.lifecycle.update.fsd` / `.asd` apply the change).
 * - `report`      — read-only classify: `query.lifecycle.report({ verb,
 *                   sourceQuery, ref, anchor })` returns a `DiffReport`
 *                   (fast/full classification) — nothing is written.
 *
 * Two-track surface (verb-agnostic, ENGINE.md §6): `query.lifecycle.report(...)`
 * classifies, then `tx.lifecycle.apply(tx, { ..., report })` applies the fast
 * track headless (full track returns the report for decision review — nothing is
 * written until decisions come back).
 */
export const lifecycle = {
	query: {
		report,
		checkTemplateUuids,
	},
	transaction: {
		extract: extractTransaction,
		instantiate: instantiateTransaction,
		transplant: { deep },
		update: updateTransaction,
		apply,
	},
}
