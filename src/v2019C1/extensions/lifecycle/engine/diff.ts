import { groupChanges } from './group'
import { matchChild } from './match-child'
import { collectUuids, indexByMatchKey } from './match-key'
import { referenceIdentity, referenceNameIdentity } from './reference-match'
import { visibleAttributes } from './visible-attributes'

import { toRef } from '@dialecte/core/helpers'

import { KEEP_ON_ORPHAN_REFS, REFERENCE_TAG_NAMES } from '@/v2019C1/constants/reference-pairs'

import type {
	AttributeChange,
	DecisionGroup,
	DiffNode,
	DiffReport,
	DiffSummary,
	InstanceDiff,
	ReportInstance,
} from './diff.types'
import type { Config } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * Instance-only metadata the lifecycle pipeline itself creates (naming + provenance) or
 * tool-generated structural grouping, NOT author content. These must never be classified
 * as `target-only` (they would then surface as spurious "keep/remove" decisions and could
 * be deleted). `FunctionRole`/`FunctionRoleContent` are SET's `assign-to-application`
 * grouping — created from scratch (no `templateUuid`) and re-derived
 * idempotently, so they are reconciled structurally, never offered for author-removal.
 * The transparent `Private` wrapper is unwrapped so genuine author children inside it
 * (e.g. a `DOS`) are still classified.
 */
const ENGINE_MANAGED_TAGS = new Set<string>([
	'LNodeSpecNaming',
	'FunctionSclRef',
	'ApplicationSclRef',
	'SclFileReference',
	'FunctionRole',
	'FunctionRoleContent',
])

/**
 * Provenance decision for a kept-leftover reference child of a shared satellite: `'removed'` when it
 * is a GENUINE removal (its target is in the source's own scope and the source no longer references
 * it), `'keep'` otherwise (another primary's link / indeterminate). See {@link diff}.
 */
export type LeftoverRefPolicy = (instanceChild: AnyTreeRecord) => Promise<'keep' | 'removed'>

/**
 * Engine diff: compares an (updated) template subtree against the
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
	/**
	 * Keep leftover instance reference children as `unchanged` instead of `removed`. Set when
	 * diffing a SHARED/catalog satellite (`AllocationRole`/`FunctionCategory`/...): its extra refs
	 * belong to OTHER primaries/instances, so a scoped single-primary update must never flag them
	 * removed (the coupling invariant: catalog satellites persist when merely un-referenced).
	 */
	keepLeftoverRefs?: boolean
	/**
	 * Provenance override for the kept-leftover case: decides, per leftover reference child, whether
	 * it is a GENUINE removal (its target is in the source's own scope and the source no longer
	 * references it) rather than another primary's link. Returns `'removed'` to override the keep.
	 * Only consulted when the ref would otherwise be kept.
	 */
	leftoverRefPolicy?: LeftoverRefPolicy
	/**
	 * Treat every REFERENCE child (link element) as `added` instead of matching it to an existing
	 * instance ref by template lineage. Set for a satellite folded on the INSTANTIATE scenario: a
	 * fresh instantiation always creates its OWN per-instance refs (e.g. one `FunctionCatRef` per new
	 * SubFunction), so a ref that lineage-matches a PRIOR instance's ref is still a genuine addition.
	 * The container itself still matches (merge into it); only its ref children are forced added, and
	 * the prior instance's refs are kept as unchanged context (with `keepLeftoverRefs`).
	 */
	refsAlwaysAdded?: boolean
	/** How instance elements match source. `templateUuid` (default) or `uuid` (fork). */
	matchKey?: MatchKey
	/**
	 * Child tags to treat as BOUNDARIES: their subtrees are excluded from the diff because another
	 * report covers them (e.g. the topology frame report delegates Application/Function to the fn/app
	 * per-primary reports).
	 */
	omit?: readonly string[]
}): Promise<InstanceDiff> {
	const { sourceQuery, targetQuery, sourceRootRef, instanceRootRef, keepLeftoverRefs } = params
	const leftoverRefPolicy = params.leftoverRefPolicy
	const refsAlwaysAdded = params.refsAlwaysAdded ?? false
	const matchKey = params.matchKey ?? 'templateUuid'
	const omit = params.omit

	const sourceTree = await sourceQuery.any.getTree(sourceRootRef)
	if (!sourceTree) throw new Error('diff: source subtree not found')

	const instanceTree = instanceRootRef ? await targetQuery.any.getTree(instanceRootRef) : undefined

	// no instance yet -> first-time instantiate: the whole template is added (fast)
	if (!instanceTree) {
		const root = addedNode(sourceTree, omit)
		return { root, groups: groupChanges(root), summary: summarize(root) }
	}

	const index = new Map<string, AnyTreeRecord>()
	await indexByMatchKey(targetQuery, { node: instanceTree, index, matchKey })

	const sourceUuids = new Set<string>()
	await collectUuids(sourceQuery, { node: sourceTree, out: sourceUuids })

	const root = await diffMatched(sourceQuery, {
		targetQuery,
		sourceNode: sourceTree,
		instanceNode: instanceTree,
		index,
		sourceUuids,
		keepLeftoverRefs: keepLeftoverRefs ?? false,
		leftoverRefPolicy,
		refsAlwaysAdded,
		matchKey,
		omit,
	})
	const summary = summarize(root)
	const groups = groupChanges(root, instanceTree.id)
	return { root, groups, summary }
}

async function diffMatched(
	sourceQuery: Core.Query<Config>,
	params: {
		targetQuery: Core.Query<Config>
		sourceNode: AnyTreeRecord
		instanceNode: AnyTreeRecord
		index: Map<string, AnyTreeRecord>
		sourceUuids: ReadonlySet<string>
		keepLeftoverRefs: boolean
		leftoverRefPolicy?: LeftoverRefPolicy
		refsAlwaysAdded?: boolean
		matchKey: MatchKey
		omit?: readonly string[]
	},
): Promise<DiffNode> {
	const { targetQuery, sourceNode, instanceNode, index, sourceUuids, keepLeftoverRefs, matchKey } =
		params
	const leftoverRefPolicy = params.leftoverRefPolicy
	const refsAlwaysAdded = params.refsAlwaysAdded ?? false
	const omit = params.omit
	const attributeChanges = await computeAttributeChanges(sourceQuery, {
		targetQuery,
		sourceNode,
		instanceNode,
	})

	const children: DiffNode[] = []
	const matchedInstanceIds = new Set<string>()

	// source children: matched -> recurse; unmatched -> added subtree
	for (const sourceChild of sourceNode.tree) {
		// a boundary tag is covered by another report - exclude its subtree
		if (omit?.includes(sourceChild.tagName)) continue
		const matched = await matchChild(sourceQuery, {
			targetQuery,
			sourceChild,
			instanceParent: instanceNode,
			index,
			matchedInstanceIds,
			refsAlwaysAdded,
		})
		if (matched) {
			matchedInstanceIds.add(matched.id)
			children.push(
				await diffMatched(sourceQuery, {
					targetQuery,
					sourceNode: sourceChild,
					instanceNode: matched,
					index,
					sourceUuids,
					keepLeftoverRefs,
					leftoverRefPolicy,
					refsAlwaysAdded,
					matchKey,
					omit,
				}),
			)
		} else {
			children.push(addedNode(sourceChild, omit))
		}
	}

	// instance children with no surviving source match:
	//  - an identified element whose template lineage is gone (templateUuid not in source)
	//    -> removed;
	//  - a uuid-less REFERENCE (link) element with no matching source child (e.g. a
	//    dropped AllocationRoleRef) -> removed;
	//  - a non-ref element with NO templateUuid = author-added after instantiation
	//    -> target-only (preserved by default; removed only on explicit accept).
	//
	// MULTI-INSTANCE: a template that references a target ONCE may, in the project, be referenced by
	// SEVERAL instances of that target (e.g. a shared AllocationRole gains one FunctionRef per
	// instantiated Function). The source has a single such ref (matched to one instance ref); the
	// sibling instance refs are NOT removals but other instances' links. Keep them when their
	// identity matches a template ref of the same tag, OR unconditionally for a SHARED satellite
	// (`keepLeftoverRefs`) whose extra refs belong to other primaries and cannot be resolved back to
	// this template (mismatched `templateUuid` + de-duped names).
	const sourceRefIdentities = await collectSourceRefIdentities(sourceQuery, sourceNode)
	for (const instanceChild of instanceNode.tree) {
		if (matchedInstanceIds.has(instanceChild.id)) continue
		// a boundary tag is covered by another report - never flag it here
		if (omit?.includes(instanceChild.tagName)) continue
		const lineage = await targetQuery.any.getAttribute(instanceChild, { name: matchKey })
		if (lineage) {
			if (!sourceUuids.has(lineage)) children.push(removedNode(instanceChild))
			continue
		}
		if (
			REFERENCE_TAG_NAMES.has(instanceChild.tagName) &&
			!KEEP_ON_ORPHAN_REFS.has(instanceChild.tagName)
		) {
			const keep =
				keepLeftoverRefs ||
				(await isMultiInstanceSiblingRef(targetQuery, instanceChild, sourceRefIdentities))
			// Provenance override: a kept leftover ref is still a GENUINE removal when the policy says
			// its target is in the source's own scope AND the source no longer references it.
			const genuinelyRemoved =
				keep && leftoverRefPolicy ? (await leftoverRefPolicy(instanceChild)) === 'removed' : false
			if (keep && !genuinelyRemoved) {
				children.push(unchangedRefNode(instanceChild))
			} else {
				children.push(removedNode(instanceChild))
			}
			continue
		}
		pushInstanceOnly(instanceChild, children)
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

function addedNode(node: AnyTreeRecord, omit?: readonly string[]): DiffNode {
	const children: DiffNode[] = node.tree
		.filter((child) => !omit?.includes(child.tagName))
		.map((child) => addedNode(child, omit))
	return { change: 'added', tagName: node.tagName, sourceRef: toRef(node), children }
}

function removedNode(node: AnyTreeRecord): DiffNode {
	const children: DiffNode[] = node.tree.map((child) => removedNode(child))
	return { change: 'removed', tagName: node.tagName, instanceRef: toRef(node), children }
}

/** A kept, unchanged instance reference (a multi-instance sibling link — see {@link diffMatched}). */
function unchangedRefNode(node: AnyTreeRecord): DiffNode {
	return { change: 'unchanged', tagName: node.tagName, instanceRef: toRef(node), children: [] }
}

/**
 * The template-space reference identities of a node's own REFERENCE children (uuid and, as a
 * fallback, resolved target name). A leftover instance reference whose identity is in this set is a
 * multi-instance sibling (another instance's link to the same template target), not a removal.
 */
async function collectSourceRefIdentities(
	sourceQuery: Core.Query<Config>,
	sourceNode: AnyTreeRecord,
): Promise<ReadonlySet<string>> {
	const identities = new Set<string>()
	for (const child of sourceNode.tree) {
		if (!REFERENCE_TAG_NAMES.has(child.tagName)) continue
		const uuidIdentity = await referenceIdentity(sourceQuery, child, { mapToTemplate: false })
		if (uuidIdentity) identities.add(uuidIdentity)
		const nameIdentity = await referenceNameIdentity(sourceQuery, child)
		if (nameIdentity) identities.add(nameIdentity)
	}
	return identities
}

/** Whether an unmatched instance reference is a multi-instance sibling of a template reference. */
async function isMultiInstanceSiblingRef(
	targetQuery: Core.Query<Config>,
	instanceChild: AnyTreeRecord,
	sourceRefIdentities: ReadonlySet<string>,
): Promise<boolean> {
	if (sourceRefIdentities.size === 0) return false
	const uuidIdentity = await referenceIdentity(targetQuery, instanceChild, { mapToTemplate: true })
	if (uuidIdentity && sourceRefIdentities.has(uuidIdentity)) return true
	const nameIdentity = await referenceNameIdentity(targetQuery, instanceChild)
	return !!nameIdentity && sourceRefIdentities.has(nameIdentity)
}

// An author-added instance element with no source lineage. Its subtree travels with it.
function targetOnlyNode(node: AnyTreeRecord): DiffNode {
	const children: DiffNode[] = node.tree.map((child) => targetOnlyNode(child))
	return { change: 'target-only', tagName: node.tagName, instanceRef: toRef(node), children }
}

/**
 * Classify an unmatched, uuid-less, non-reference instance child. Engine-managed
 * metadata is ignored (preserved silently); the transparent `Private` wrapper is
 * unwrapped so genuine author children inside it are still surfaced; anything else is
 * an author-added `target-only` element.
 */
function pushInstanceOnly(node: AnyTreeRecord, out: DiffNode[]): void {
	if (ENGINE_MANAGED_TAGS.has(node.tagName)) return
	if (node.tagName === 'Private') {
		for (const child of node.tree) pushInstanceOnly(child, out)
		return
	}
	out.push(targetOnlyNode(node))
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

/**
 * Assemble the per-instance {@link ReportInstance}s into the consumer-facing
 * {@link DiffReport}: `summary` sums every instance's primary tree and
 * `needsDecisions` is true when any instance has a decision group.
 */
export function assembleReport(instances: ReportInstance[]): DiffReport {
	const summary = instances.reduce<DiffSummary>(
		(acc, instance) => {
			const instanceSummary = summarize(instance.tree)
			return {
				added: acc.added + instanceSummary.added,
				removed: acc.removed + instanceSummary.removed,
				modified: acc.modified + instanceSummary.modified,
			}
		},
		{ added: 0, removed: 0, modified: 0 },
	)
	return {
		instances,
		// Fast track (no decisions) for a first-time instantiate: an instance with no
		// existing root (`rootRef` undefined) is headless-applied even though it carries
		// an `added` group. Only an EXISTING instance with changes needs a decision.
		needsDecisions: instances.some(
			(instance) => instance.rootRef !== undefined && instance.groups.length > 0,
		),
		summary,
	}
}

/** Every decision group across all instances — the flat surface the decision engine consumes. */
export function allGroups(report: DiffReport): DecisionGroup[] {
	return report.instances.flatMap((instance) => instance.groups)
}

/** All element ids in a diff tree, by side (`instanceRef` for staged/existing, `sourceRef` for added). */
export function collectTreeIds(root: DiffNode, side: 'instanceRef' | 'sourceRef'): string[] {
	const ids: string[] = []
	const visit = (node: DiffNode): void => {
		const id = node[side]?.id
		if (id) ids.push(id)
		for (const child of node.children) visit(child)
	}
	visit(root)
	return ids
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
