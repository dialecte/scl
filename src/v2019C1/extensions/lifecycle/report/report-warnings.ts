import type {
	DiffNode,
	DiffReport,
	ReportWarning,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'

/**
 * What the report did that the consumer should know of, read from its nodes: each reference paired by name, once,
 * wherever the report lists it (an instance's tree, a group's primary or companions); and each satellite an
 * application's role refers to that its placement does not place; and each reference of what a placement places naming
 * what it does not place, once.
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
	const notPlaced: ReportWarning[] = report.instances.flatMap(function notPlacedOf(instance) {
		return (instance.satellitesNotPlaced ?? []).map(function warnOf(source): ReportWarning {
			return { code: 'satellite-not-placed', source }
		})
	})
	// a reference met by several passes (the frame and its diff, a function and its instance's) is told of once
	const referencesNotPlaced = new Map<string, ReportWarning>()
	for (const instance of report.instances) {
		for (const outside of instance.referencesNotPlaced ?? []) {
			if (!referencesNotPlaced.has(outside.reference.id))
				referencesNotPlaced.set(outside.reference.id, { code: 'reference-not-placed', ...outside })
		}
	}
	return [...warnings.values(), ...notPlaced, ...referencesNotPlaced.values()]
}

/** Whether a node, or one below it, is a reference paired by name: what the report lists even when nothing changed. */
export function holdsPairingByName(node: DiffNode): boolean {
	return node.pairedByName !== undefined || node.children.some(holdsPairingByName)
}
