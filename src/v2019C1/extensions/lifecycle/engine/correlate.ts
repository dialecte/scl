import type { DiffNode, DiffReport, ReportInstance } from './diff.types'
import type { Scl } from '@/v2019C1/config'
import type { AnyRefOrRecord } from '@dialecte/core'

/** A source record id → the element it became in the applied document. */
export type AppliedTargets = ReadonlyMap<string, AnyRefOrRecord>

/**
 * Build a `source.id → target ref` map from the clone mappings of ONE instance (a first-time clone,
 * or everything an update added to it). Within one instance each source element is cloned once, so
 * the map is unambiguous; the per-instance assembly (one map per instance) is what keeps two
 * instances of the same template distinct.
 */
export function sourceToTargetMap(
	cloneMappings: readonly Scl.CloneMapping[],
): Map<string, AnyRefOrRecord> {
	const map = new Map<string, AnyRefOrRecord>()
	for (const mapping of cloneMappings) {
		if (mapping.source.id) map.set(mapping.source.id, mapping.target)
	}
	return map
}

/**
 * Fill `appliedRef` on every realized node of ONE report instance, so the report itself carries the
 * report→applied correlation (the consumer never re-derives it). Per node:
 *  - `removed` → left undefined (the element is gone from the applied doc);
 *  - otherwise a node with `instanceRef` (matched / modified / unchanged / target-only) → its own
 *    `instanceRef` (reconcile updates in place, so the id is stable);
 *  - otherwise an `added` node → its freshly-cloned element via `added` (keyed by `sourceRef.id`).
 *
 * External satellite companions live OUTSIDE `tree`, so each group's companion subtrees are walked
 * too. Each mapping the instance carries gets its `appliedRef` the same way. Distinct `DiffNode` objects mean two instances of one template annotate independently — the
 * disambiguation a global `source.id` map could not provide.
 */
export function annotateInstance(params: {
	reportInstance: ReportInstance
	added: AppliedTargets
}): void {
	const { reportInstance, added } = params
	annotateNode({ node: reportInstance.tree, added })
	for (const group of reportInstance.groups) {
		for (const companion of group.companions) annotateNode({ node: companion, added })
	}
	// a mapping says where a source element lands: on the element it is mapped onto, or on the one
	// created for it
	for (const mapping of reportInstance.mappings) {
		const applied =
			mapping.mapping && 'existing' in mapping.mapping
				? mapping.mapping.existing
				: added.get(mapping.sourceId ?? mapping.id)
		if (applied) mapping.appliedRef = applied
	}
}

/**
 * Forget what an earlier run of the same report placed: every node and every mapping loses its
 * `appliedRef`. A report is applied more than once (a preview with everything accepted, a dry run
 * with the decisions, the commit), and a run fills `appliedRef` only where it places something, so
 * what one run leaves out would otherwise keep the element an earlier run placed for it.
 */
export function clearAnnotations(params: { report: DiffReport }): void {
	const { report } = params
	for (const reportInstance of report.instances) {
		clearNode({ node: reportInstance.tree })
		for (const group of reportInstance.groups) {
			for (const companion of group.companions) clearNode({ node: companion })
		}
		for (const mapping of reportInstance.mappings) delete mapping.appliedRef
	}
	for (const mapping of report.mappings) delete mapping.appliedRef
}

function clearNode(params: { node: DiffNode }): void {
	const { node } = params
	delete node.appliedRef
	for (const child of node.children) clearNode({ node: child })
}

function annotateNode(params: { node: DiffNode; added: AppliedTargets }): void {
	const { node, added } = params
	if (node.change !== 'removed') {
		if (node.instanceRef) node.appliedRef = node.instanceRef
		else if (node.sourceRef?.id) {
			const target = added.get(node.sourceRef.id)
			if (target) node.appliedRef = target
		}
	}
	for (const child of node.children) annotateNode({ node: child, added })
}
