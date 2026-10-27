import type {
	DiffNode,
	DiffReport,
	ReportWarning,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'

/**
 * What the report did that the consumer should know of, read from its nodes: each reference paired by name, once,
 * wherever the report lists it (an instance's tree, a group's primary or companions).
 */
export function collectReportWarnings(report: DiffReport): ReportWarning[] {
	const warnings = new Map<string, ReportWarning>()
	const pending: DiffNode[] = []
	for (const instance of report.instances) {
		pending.push(instance.tree)
		for (const group of instance.groups) pending.push(group.primary, ...group.companions)
	}
	while (pending.length > 0) {
		const node = pending.pop() as DiffNode
		pending.push(...node.children)
		const id = node.instanceRef?.id
		if (!node.pairedByName || !node.instanceRef || !id || warnings.has(id)) continue
		warnings.set(id, {
			code: 'reference-paired-by-name',
			reference: node.instanceRef,
			...(node.sourceRef ? { source: node.sourceRef } : {}),
			lineage: node.pairedByName,
		})
	}
	return [...warnings.values()]
}

/** Whether a node, or one below it, is a reference paired by name: what the report lists even when nothing changed. */
export function holdsPairingByName(node: DiffNode): boolean {
	return node.pairedByName !== undefined || node.children.some(holdsPairingByName)
}
