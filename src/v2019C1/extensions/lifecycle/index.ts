import { apply } from './apply'
import { makeUnique } from './constraints'
import * as extractTransaction from './extract'
import { exportOptions } from './extract/query'
import { classifyIeds } from './ied'
import * as instantiateTransaction from './instantiate'
import { report } from './report'
import { scenarioOf } from './scenario-of'
import { sourceRoot } from './source-root'
import { deep } from './transplant'
import * as updateTransaction from './update'
import { checkTemplateUuids } from './validate'

/**
 * SCL content lifecycle — the verbs that move template/instance content across
 * documents, grouped under a single `lifecycle` module so consumers get one
 * stable, discoverable surface: `tx.lifecycle.<verb>.<recipe>` /
 * `query.lifecycle.<verb>.<recipe>`.
 *
 * - `extract`     — pull an element out into a template FSD/ASD/SSD
 *                   (`tx.lifecycle.extract.fsd` / `.asd` / `.ssd` /
 *                   `.ensureSubstationTemplateStructure`); `.ied` exports a specification IED
 *                   into an ISD.
 * - `instantiate` — instantiate template content into a project
 *                   (`tx.lifecycle.instantiate.fsd` / `.asd`).
 * - `transplant`  — generic clone engine (`tx.lifecycle.transplant.deep`).
 * - `update`      — instantiate-or-reconcile a project against a newer template
 *                   (`tx.lifecycle.update.fsd` / `.asd` apply the change).
 * - `makeUnique`  — make an element unique where it sits, in the engine's one numbering
 *                   (`tx.lifecycle.makeUnique`); what a consumer calls after naming an element.
 * - `classifyIeds` — read-only: every IED is a real device's IED or a specification IED
 *                   (`query.lifecycle.classifyIeds()`).
 * - `exportOptions` — read-only: the file types an IED can be exported as, or why not
 *                   (`query.lifecycle.exportOptions({ iedRef })`).
 * - `report`      — read-only classify: `query.lifecycle.report({ verb,
 *                   sourceQuery, ref, anchor })` returns a `DiffReport`
 *                   (fast/full classification) — nothing is written. `verb: 'ied'`
 *                   reports the first placement of an IED, or its update (`template`, or a
 *                   `fork` on an open ISD), which `tx.lifecycle.apply` writes.
 * - `sourceRoot`  — read-only: what a source file holds to place, per verb
 *                   (`query.lifecycle.sourceRoot.fsd` / `.asd` / `.ssd` / `.ied`).
 * - `scenarioOf`  — read-only: the scenario an operation runs with, or why it is refused, per verb
 *                   (`query.lifecycle.scenarioOf.ied`; `.fsd` / `.asd` / `.ssd` tell the same file only).
 *
 * Two-track surface (verb-agnostic): `query.lifecycle.report(...)`
 * classifies, then `tx.lifecycle.apply(tx, { ..., report })` applies the fast
 * track headless (full track returns the report for decision review — nothing is
 * written until decisions come back).
 */
export const lifecycle = {
	query: {
		report,
		checkTemplateUuids,
		classifyIeds,
		exportOptions,
		sourceRoot,
		scenarioOf,
	},
	transaction: {
		extract: extractTransaction,
		instantiate: instantiateTransaction,
		transplant: { deep },
		update: updateTransaction,
		apply,
		makeUnique,
	},
}
