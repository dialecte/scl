import { toRef } from '@dialecte/core/helpers'

import type { AttributeChange, DiffNode, DiffReport, DiffSummary } from './diff.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord, AnyTreeRecord } from '@dialecte/core'

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
const IDENTITY_ATTRS = new Set(['uuid', 'templateUuid', 'originUuid'])

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
		return { root, needsDecisions: false, summary: summarize(root) }
	}

	const index = new Map<string, AnyTreeRecord>()
	await indexByTemplateUuid(targetQuery, instanceTree, index)

	const sourceUuids = new Set<string>()
	await collectUuids(sourceQuery, sourceTree, sourceUuids)

	const root = await diffMatched(
		sourceQuery,
		targetQuery,
		sourceTree,
		instanceTree,
		index,
		sourceUuids,
	)
	const summary = summarize(root)
	const needsDecisions = summary.added + summary.removed + summary.modified > 0
	return { root, needsDecisions, summary }
}

async function diffMatched(
	sourceQuery: Core.Query<Config>,
	targetQuery: Core.Query<Config>,
	sourceNode: AnyTreeRecord,
	instanceNode: AnyTreeRecord,
	index: Map<string, AnyTreeRecord>,
	sourceUuids: ReadonlySet<string>,
): Promise<DiffNode> {
	const attributeChanges = await computeAttributeChanges(
		sourceQuery,
		targetQuery,
		sourceNode,
		instanceNode,
	)

	const children: DiffNode[] = []
	const matchedInstanceIds = new Set<string>()

	// source children: matched -> recurse; unmatched -> added subtree
	for (const sourceChild of sourceNode.tree) {
		const sourceUuid = await sourceQuery.any.getAttribute(sourceChild, { name: 'uuid' })
		const matched = sourceUuid ? index.get(sourceUuid) : undefined
		if (matched) {
			matchedInstanceIds.add(matched.id)
			children.push(
				await diffMatched(sourceQuery, targetQuery, sourceChild, matched, index, sourceUuids),
			)
		} else {
			children.push(addedNode(sourceChild))
		}
	}

	// instance children whose template lineage is gone from the source -> removed
	for (const instanceChild of instanceNode.tree) {
		if (matchedInstanceIds.has(instanceChild.id)) continue
		const templateUuid = await targetQuery.any.getAttribute(instanceChild, { name: 'templateUuid' })
		if (templateUuid && !sourceUuids.has(templateUuid)) {
			children.push(removedNode(instanceChild))
		}
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
	targetQuery: Core.Query<Config>,
	sourceNode: AnyTreeRecord,
	instanceNode: AnyTreeRecord,
): Promise<AttributeChange[]> {
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

/** Drop identity + the project-owned `name` from an attribute map. */
function visibleAttributes(attributes: Record<string, string>): Record<string, string> {
	const visible: Record<string, string> = {}
	for (const [name, value] of Object.entries(attributes)) {
		if (IDENTITY_ATTRS.has(name) || name === 'name') continue
		visible[name] = value
	}
	return visible
}

async function indexByTemplateUuid(
	targetQuery: Core.Query<Config>,
	node: AnyTreeRecord,
	index: Map<string, AnyTreeRecord>,
): Promise<void> {
	const templateUuid = await targetQuery.any.getAttribute(node, { name: 'templateUuid' })
	if (templateUuid) index.set(templateUuid, node)
	for (const child of node.tree) await indexByTemplateUuid(targetQuery, child, index)
}

async function collectUuids(
	sourceQuery: Core.Query<Config>,
	node: AnyTreeRecord,
	out: Set<string>,
): Promise<void> {
	const uuid = await sourceQuery.any.getAttribute(node, { name: 'uuid' })
	if (uuid) out.add(uuid)
	for (const child of node.tree) await collectUuids(sourceQuery, child, out)
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
