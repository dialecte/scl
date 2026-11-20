import { REFERENCE_UUIDS_BY_TAG } from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'

import type {
	DiffNode,
	DiffReport,
	ReportWarning,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'

/**
 * What the report did that the consumer should know of, read from its nodes: each reference paired by name, each
 * element paired in order among identical ones, each paired by key, and each control block whose revision a data set
 * change cannot raise, once, wherever the report lists it (an instance's tree, a group's primary or companions); and
 * each satellite an
 * application's role refers to that its placement does not place; and each reference of what a placement places naming
 * what it does not place, once.
 */
export function collectReportWarnings(report: DiffReport): ReportWarning[] {
	const warnings = new Map<string, ReportWarning>()
	const twins = new Map<string, ReportWarning>()
	const byKey = new Map<string, ReportWarning>()
	const notRaised = new Map<string, ReportWarning>()
	const pending: DiffNode[] = []
	for (const instance of report.instances) {
		pending.push(instance.tree)
		for (const group of instance.groups) pending.push(group.primary, ...group.companions)
	}
	while (pending.length > 0) {
		const node = pending.pop() as DiffNode
		pending.push(...node.children)
		for (const warning of notRaisedWarnings(node)) {
			const blockId = warning.reference.id
			if (blockId && !notRaised.has(blockId)) notRaised.set(blockId, warning)
		}
		const id = node.instanceRef?.id
		if (!node.instanceRef || !id) continue
		if (node.pairedByName && !warnings.has(id)) {
			warnings.set(id, {
				code: 'reference-paired-by-name',
				reference: node.instanceRef,
				...(node.sourceRef ? { source: node.sourceRef } : {}),
				lineage: node.pairedByName,
			})
		}
		for (const unresolved of node.retargetUnresolved ?? []) {
			const key = `${id}|${unresolved.attribute}`
			if (!warnings.has(key)) {
				warnings.set(key, {
					code: 'reference-retarget-unresolved',
					reference: node.instanceRef,
					...unresolved,
				})
			}
		}
		if (node.pairedByKey !== undefined && !byKey.has(id)) {
			byKey.set(id, {
				code: 'element-paired-by-key',
				reference: node.instanceRef,
				...(node.sourceRef ? { source: node.sourceRef } : {}),
				key: node.pairedByKey,
			})
		}
		if (node.pairedAmongTwins && !twins.has(id)) {
			twins.set(id, {
				code: REFERENCE_UUIDS_BY_TAG.has(node.tagName)
					? 'identical-references-paired-in-order'
					: 'identical-elements-paired-in-order',
				reference: node.instanceRef,
				...(node.sourceRef ? { source: node.sourceRef } : {}),
			})
		}
	}
	const notPlaced: ReportWarning[] = report.instances.flatMap(function notPlacedOf(instance) {
		return (instance.satellitesNotPlaced ?? []).map(function warnOf(source): ReportWarning {
			return { code: 'satellite-not-placed', source }
		})
	})
	return [
		...warnings.values(),
		...twins.values(),
		...byKey.values(),
		...notRaised.values(),
		...notPlaced,
		...referencesNotPlacedOf(report),
	]
}

/** Each reference of what a placement places naming what it does not place, once. */
function referencesNotPlacedOf(report: DiffReport): ReportWarning[] {
	// a reference met by several passes (the frame and its diff, a function and its instance's) is told of once
	const referencesNotPlaced = new Map<string, ReportWarning>()
	for (const instance of report.instances) {
		for (const outside of instance.referencesNotPlaced ?? []) {
			if (!referencesNotPlaced.has(outside.reference.id))
				referencesNotPlaced.set(outside.reference.id, { code: 'reference-not-placed', ...outside })
		}
	}
	return [...referencesNotPlaced.values()]
}

/** The control blocks a data set change on this node cannot raise, as warnings. */
function notRaisedWarnings(
	node: DiffNode,
): Extract<ReportWarning, { code: 'conf-rev-not-raised' }>[] {
	return (node.confRevNotRaised ?? []).map(({ controlBlock, value, refusal }) => ({
		code: 'conf-rev-not-raised',
		reference: controlBlock,
		value,
		refusal,
	}))
}

/** Whether a node, or one below it, is a reference paired by name: what the report lists even when nothing changed. */
export function holdsPairingByName(node: DiffNode): boolean {
	return node.pairedByName !== undefined || node.children.some(holdsPairingByName)
}
