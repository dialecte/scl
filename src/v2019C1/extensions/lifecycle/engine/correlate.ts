import type { DiffNode, ReportInstance } from './diff.types'
import type { Scl } from '@/v2019C1/config'
import type { AnyRefOrRecord } from '@dialecte/core'

/** A source record id → the element it became in the applied document. */
export type AppliedTargets = ReadonlyMap<string, AnyRefOrRecord>

/** Merge several `source.id → applied ref` maps (later wins) into one. */
export function mergeApplied(
	...maps: ReadonlyMap<string, AnyRefOrRecord>[]
): Map<string, AnyRefOrRecord> {
	const out = new Map<string, AnyRefOrRecord>()
	for (const map of maps) for (const [source, target] of map) out.set(source, target)
	return out
}

/**
 * Build a `source.id → target ref` map from one clone's mappings. Within a single clone each source
 * element is cloned once, so the map is unambiguous; the per-instance assembly (one map per instance)
 * is what keeps two instances of the same template distinct.
 */
export function sourceToTargetMap(
	mappings: readonly Scl.CloneMapping[],
): Map<string, AnyRefOrRecord> {
	const map = new Map<string, AnyRefOrRecord>()
	for (const mapping of mappings) {
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
 * too. Distinct `DiffNode` objects mean two instances of one template annotate independently — the
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
