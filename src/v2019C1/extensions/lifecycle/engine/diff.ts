import { groupChanges } from './group'
import { visibleAttributes } from './visible-attributes'

import { toRef } from '@dialecte/core/helpers'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'

import type { AttributeChange, DiffNode, DiffReport, DiffSummary } from './diff.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord, AnyTreeRecord } from '@dialecte/core'

/** Reference (link) element tags — the only uuid-less children removable on update. */
const REFERENCE_TAG_NAMES = new Set<string>(Object.keys(UUID_REFERENCE_PAIRS))

/**
 * Engine diff (ENGINE.md §3): compares an (updated) template subtree against the
 * existing instance, matched by `templateUuid` (= the source element's `uuid`),
 * and produces a structured `DiffReport`. This is the read-only "project then
 * diff" report — the same-space comparison the apply/reconcile step consumes.
 *
 * Classification (fast vs full): a missing instance = first-time instantiate =
 * fast (headless); an existing instance with any change = full (needs decisions).
 * Deliberately scoped: one subtree, matched by `templateUuid`, no reference
 * reconciliation or multi-instance disambiguation.
 */
export async function diff(params: {
	sourceQuery: Core.Query<Config>
	targetQuery: Core.Query<Config>
	sourceRootRef: AnyRefOrRecord
	/** Omit (or pass a ref that resolves to nothing) for a first-time instantiate. */
	instanceRootRef?: AnyRefOrRecord
}): Promise<DiffReport> {
	const { sourceQuery, targetQuery, sourceRootRef, instanceRootRef } = params

	const sourceTree = await sourceQuery.any.getTree(sourceRootRef)
	if (!sourceTree) throw new Error('diff: source subtree not found')

	const instanceTree = instanceRootRef ? await targetQuery.any.getTree(instanceRootRef) : undefined

	// no instance yet -> first-time instantiate: the whole template is added (fast)
	if (!instanceTree) {
		const root = addedNode(sourceTree)
		return {
			root,
			roots: [root],
			groups: groupChanges(root),
			needsDecisions: false,
			summary: summarize(root),
		}
	}

	const index = new Map<string, AnyTreeRecord>()
	await indexByTemplateUuid(targetQuery, { node: instanceTree, index })

	const sourceUuids = new Set<string>()
	await collectUuids(sourceQuery, { node: sourceTree, out: sourceUuids })

	const root = await diffMatched(sourceQuery, {
		targetQuery,
		sourceNode: sourceTree,
		instanceNode: instanceTree,
		index,
		sourceUuids,
	})
	const summary = summarize(root)
	const needsDecisions = summary.added + summary.removed + summary.modified > 0
	return {
		root,
		roots: [root],
		groups: groupChanges(root, instanceTree.id),
		needsDecisions,
		summary,
	}
}

async function diffMatched(
	sourceQuery: Core.Query<Config>,
	params: {
		targetQuery: Core.Query<Config>
		sourceNode: AnyTreeRecord
		instanceNode: AnyTreeRecord
		index: Map<string, AnyTreeRecord>
		sourceUuids: ReadonlySet<string>
	},
): Promise<DiffNode> {
	const { targetQuery, sourceNode, instanceNode, index, sourceUuids } = params
	const attributeChanges = await computeAttributeChanges(sourceQuery, {
		targetQuery,
		sourceNode,
		instanceNode,
	})

	const children: DiffNode[] = []
	const matchedInstanceIds = new Set<string>()

	// source children: matched -> recurse; unmatched -> added subtree
	for (const sourceChild of sourceNode.tree) {
		const sourceUuid = await sourceQuery.any.getAttribute(sourceChild, { name: 'uuid' })
		// Match by templateUuid lineage; fall back to a same-tag unmatched sibling
		// for uuid-less elements (e.g. FunctionRoleContent) so they are not
		// reported as spurious adds.
		const matched =
			(sourceUuid ? index.get(sourceUuid) : undefined) ??
			(sourceUuid
				? undefined
				: instanceNode.tree.find(
						(instanceChild) =>
							instanceChild.tagName === sourceChild.tagName &&
							!matchedInstanceIds.has(instanceChild.id),
					))
		if (matched) {
			matchedInstanceIds.add(matched.id)
			children.push(
				await diffMatched(sourceQuery, {
					targetQuery,
					sourceNode: sourceChild,
					instanceNode: matched,
					index,
					sourceUuids,
				}),
			)
		} else {
			children.push(addedNode(sourceChild))
		}
	}

	// instance children with no surviving source match -> removed:
	//  - an identified element whose template lineage is gone (templateUuid not in source), OR
	//  - a uuid-less REFERENCE (link) element with no matching source child (e.g. a
	//    dropped AllocationRoleRef). Non-ref content is left alone.
	for (const instanceChild of instanceNode.tree) {
		if (matchedInstanceIds.has(instanceChild.id)) continue
		const templateUuid = await targetQuery.any.getAttribute(instanceChild, { name: 'templateUuid' })
		const removed = templateUuid
			? !sourceUuids.has(templateUuid)
			: REFERENCE_TAG_NAMES.has(instanceChild.tagName)
		if (removed) children.push(removedNode(instanceChild))
	}

	return {
		change: attributeChanges.length > 0 ? 'modified' : 'unchanged',
		tagName: sourceNode.tagName,
		sourceRef: toRef(sourceNode),
		instanceRef: toRef(instanceNode),
		attributeChanges: attributeChanges.length > 0 ? attributeChanges : undefined,
		children,
	}
}

function addedNode(node: AnyTreeRecord): DiffNode {
	const children: DiffNode[] = node.tree.map((child) => addedNode(child))
	return { change: 'added', tagName: node.tagName, sourceRef: toRef(node), children }
}

function removedNode(node: AnyTreeRecord): DiffNode {
	const children: DiffNode[] = node.tree.map((child) => removedNode(child))
	return { change: 'removed', tagName: node.tagName, instanceRef: toRef(node), children }
}

async function computeAttributeChanges(
	sourceQuery: Core.Query<Config>,
	params: {
		targetQuery: Core.Query<Config>
		sourceNode: AnyTreeRecord
		instanceNode: AnyTreeRecord
	},
): Promise<AttributeChange[]> {
	const { targetQuery, sourceNode, instanceNode } = params
	const desired = visibleAttributes(await sourceQuery.any.getAttributes(sourceNode))
	const current = visibleAttributes(await targetQuery.any.getAttributes(instanceNode))

	const changes: AttributeChange[] = []
	for (const name of new Set([...Object.keys(desired), ...Object.keys(current)])) {
		const before = current[name]
		const after = desired[name]
		if (before !== after) changes.push({ name, before, after })
	}
	return changes
}

async function indexByTemplateUuid(
	targetQuery: Core.Query<Config>,
	params: { node: AnyTreeRecord; index: Map<string, AnyTreeRecord> },
): Promise<void> {
	const { node, index } = params
	const templateUuid = await targetQuery.any.getAttribute(node, { name: 'templateUuid' })
	if (templateUuid) index.set(templateUuid, node)
	for (const child of node.tree) await indexByTemplateUuid(targetQuery, { node: child, index })
}

async function collectUuids(
	sourceQuery: Core.Query<Config>,
	params: { node: AnyTreeRecord; out: Set<string> },
): Promise<void> {
	const { node, out } = params
	const uuid = await sourceQuery.any.getAttribute(node, { name: 'uuid' })
	if (uuid) out.add(uuid)
	for (const child of node.tree) await collectUuids(sourceQuery, { node: child, out })
}

/**
 * Combine several reports into one (e.g. an ASD's application-layer report plus
 * one per composed function). `root` keeps the first report's tree; `groups` is
 * the concatenation (the full-track decision surface); `summary` sums; and
 * `needsDecisions` is true if any part needs a decision.
 */
export function mergeReports(reports: [DiffReport, ...DiffReport[]]): DiffReport {
	const [first] = reports
	const groups = reports.flatMap((report) => report.groups)
	const summary = reports.reduce<DiffSummary>(
		(acc, report) => ({
			added: acc.added + report.summary.added,
			removed: acc.removed + report.summary.removed,
			modified: acc.modified + report.summary.modified,
		}),
		{ added: 0, removed: 0, modified: 0 },
	)
	const needsDecisions = reports.some((report) => report.needsDecisions)
	return {
		root: first.root,
		roots: reports.flatMap((report) => report.roots),
		groups,
		needsDecisions,
		summary,
	}
}

function summarize(root: DiffNode): DiffSummary {
	const summary: DiffSummary = { added: 0, removed: 0, modified: 0 }
	const visit = (node: DiffNode): void => {
		if (node.change === 'added') summary.added++
		else if (node.change === 'removed') summary.removed++
		else if (node.change === 'modified') summary.modified++
		for (const child of node.children) visit(child)
	}
	visit(root)
	return summary
}
