import { groupChanges } from './group'
import { visibleAttributes } from './visible-attributes'

import { toRef } from '@dialecte/core/helpers'

import {
	KEEP_ON_ORPHAN_REFS,
	REFERENCE_TAG_NAMES,
	UUID_REFERENCE_PAIRS,
} from '@/v2019C1/constants/reference-pairs'

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
}): Promise<InstanceDiff> {
	const { sourceQuery, targetQuery, sourceRootRef, instanceRootRef, keepLeftoverRefs } = params
	const leftoverRefPolicy = params.leftoverRefPolicy
	const refsAlwaysAdded = params.refsAlwaysAdded ?? false

	const sourceTree = await sourceQuery.any.getTree(sourceRootRef)
	if (!sourceTree) throw new Error('diff: source subtree not found')

	const instanceTree = instanceRootRef ? await targetQuery.any.getTree(instanceRootRef) : undefined

	// no instance yet -> first-time instantiate: the whole template is added (fast)
	if (!instanceTree) {
		const root = addedNode(sourceTree)
		return { root, groups: groupChanges(root), summary: summarize(root) }
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
		keepLeftoverRefs: keepLeftoverRefs ?? false,
		leftoverRefPolicy,
		refsAlwaysAdded,
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
	},
): Promise<DiffNode> {
	const { targetQuery, sourceNode, instanceNode, index, sourceUuids, keepLeftoverRefs } = params
	const leftoverRefPolicy = params.leftoverRefPolicy
	const refsAlwaysAdded = params.refsAlwaysAdded ?? false
	const attributeChanges = await computeAttributeChanges(sourceQuery, {
		targetQuery,
		sourceNode,
		instanceNode,
	})

	const children: DiffNode[] = []
	const matchedInstanceIds = new Set<string>()

	// source children: matched -> recurse; unmatched -> added subtree
	for (const sourceChild of sourceNode.tree) {
		const matched = await matchInstanceChild(sourceQuery, {
			targetQuery,
			sourceChild,
			instanceNode,
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
				}),
			)
		} else {
			children.push(addedNode(sourceChild))
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
		const templateUuid = await targetQuery.any.getAttribute(instanceChild, { name: 'templateUuid' })
		if (templateUuid) {
			if (!sourceUuids.has(templateUuid)) children.push(removedNode(instanceChild))
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

/**
 * Find the instance child that corresponds to a source child.
 *  - Identified elements match by `templateUuid` lineage (the source `uuid`).
 *  - A uuid-less REFERENCE (e.g. `FunctionRef`) matches by its reference IDENTITY — the
 *    target `*Uuid` it points to — never by tag position, so a template ref to a target the
 *    instance does not yet reference surfaces as a genuine `added`, and a ref whose target
 *    is unresolved falls back to positional pairing (preserving existing behaviour).
 *  - Any other uuid-less element (e.g. `FunctionRoleContent`) matches a same-tag sibling by
 *    position, so it is not reported as a spurious add.
 */
async function matchInstanceChild(
	sourceQuery: Core.Query<Config>,
	params: {
		targetQuery: Core.Query<Config>
		sourceChild: AnyTreeRecord
		instanceNode: AnyTreeRecord
		index: Map<string, AnyTreeRecord>
		matchedInstanceIds: ReadonlySet<string>
		refsAlwaysAdded?: boolean
	},
): Promise<AnyTreeRecord | undefined> {
	const { targetQuery, sourceChild, instanceNode, index, matchedInstanceIds } = params

	const sourceUuid = await sourceQuery.any.getAttribute(sourceChild, { name: 'uuid' })
	if (sourceUuid) {
		// Template lineage is only valid within the same element type. A placeholder `templateUuid`
		// smeared across unrelated tags (real .ssd files reuse one dummy value on Substation,
		// FunctionCategory, AllocationRole, LNode...) can coincide with a source `uuid`; a cross-type
		// hit is a collision, not a lineage, so require the matched node to share the source tag.
		const matched = index.get(sourceUuid)
		return matched && matched.tagName === sourceChild.tagName ? matched : undefined
	}

	// INSTANTIATE: a fresh instantiation creates its OWN per-instance refs, so never match a link to
	// a prior instance's ref — surface it as `added` (the prior refs stay as kept context).
	if (params.refsAlwaysAdded && REFERENCE_TAG_NAMES.has(sourceChild.tagName)) return undefined

	const candidates = instanceNode.tree.filter(
		(instanceChild) =>
			instanceChild.tagName === sourceChild.tagName && !matchedInstanceIds.has(instanceChild.id),
	)
	if (candidates.length === 0) return undefined

	if (REFERENCE_TAG_NAMES.has(sourceChild.tagName)) {
		// The source ref's target uuid is already TEMPLATE space (do not normalize it — an
		// extracted template may carry its own `templateUuid`). The instance ref's target uuid is
		// mapped back to template space via its element's `templateUuid` so the two compare equal.
		const sourceIdentity = await referenceIdentity(sourceQuery, sourceChild, {
			mapToTemplate: false,
		})
		if (sourceIdentity === undefined) return candidates[0]
		for (const candidate of candidates) {
			const candidateIdentity = await referenceIdentity(targetQuery, candidate, {
				mapToTemplate: true,
			})
			if (candidateIdentity === sourceIdentity) return candidate
		}
		// Fallback: the uuid round-trip fails when a project was authored with PLACEHOLDER
		// `templateUuid`s that are not the source element's own `uuid` (real .ssd files reuse one
		// templateUuid across elements). Match instead by the resolved TARGET NAME, which is stable
		// across instantiate (a ref to "PIU" still resolves to an AllocationRole named "PIU").
		const sourceNameIdentity = await referenceNameIdentity(sourceQuery, sourceChild)
		if (sourceNameIdentity === undefined) return undefined
		for (const candidate of candidates) {
			const candidateNameIdentity = await referenceNameIdentity(targetQuery, candidate)
			if (candidateNameIdentity === sourceNameIdentity) return candidate
		}
		return undefined
	}

	return candidates[0]
}

/**
 * The reference identity of a link element: the set of target `*Uuid` attributes it carries,
 * as a stable string. When `mapToTemplate` is set (the INSTANCE side), each target uuid is
 * resolved to its element's `templateUuid` so an instantiated (remapped) reference compares
 * equal to the template reference it came from. The SOURCE side passes the raw uuids, which are
 * already template space. Returns `undefined` when no uuid attribute is set (unresolved ref),
 * so matching falls back to position.
 */
async function referenceIdentity(
	query: Core.Query<Config>,
	node: AnyTreeRecord,
	options: { mapToTemplate: boolean },
): Promise<string | undefined> {
	const pairs = UUID_REFERENCE_PAIRS[node.tagName as keyof typeof UUID_REFERENCE_PAIRS]
	if (!pairs) return undefined
	const parts: string[] = []
	for (const pair of pairs) {
		const uuidValue = await query.any.getAttribute(node, { name: pair.attribute.uuid })
		if (!uuidValue) continue
		const identity = options.mapToTemplate
			? await toTemplateSpaceUuid(query, uuidValue, pair.target)
			: uuidValue
		parts.push(`${pair.attribute.uuid}=${identity}`)
	}
	return parts.length > 0 ? parts.sort().join('|') : undefined
}

/**
 * Resolve an instance target `uuid` to its template-space identity: the referenced element's
 * `templateUuid` if it is an instance, else the uuid itself (an external/unresolvable target).
 */
async function toTemplateSpaceUuid(
	query: Core.Query<Config>,
	uuidValue: string,
	targetTags: readonly string[],
): Promise<string> {
	for (const tagName of targetTags) {
		const matches = await query.findByAttributes({
			tagName: tagName as Parameters<typeof query.findByAttributes>[0]['tagName'],
			attributes: { uuid: uuidValue } as Record<string, string>,
		})
		const target = matches[0]
		if (target) {
			const templateUuid = await query.any.getAttribute(target, { name: 'templateUuid' })
			return templateUuid || uuidValue
		}
	}
	return uuidValue
}

/**
 * Fallback identity for a reference node: the NAME of each resolved target element. Stable across
 * instantiate even when the project uses placeholder `templateUuid`s that are not the source
 * element's own `uuid` (so the uuid round-trip in {@link referenceIdentity} cannot bridge the two
 * sides). Undefined when no target resolves to a named element.
 */
async function referenceNameIdentity(
	query: Core.Query<Config>,
	node: AnyTreeRecord,
): Promise<string | undefined> {
	const pairs = UUID_REFERENCE_PAIRS[node.tagName as keyof typeof UUID_REFERENCE_PAIRS]
	if (!pairs) return undefined
	const parts: string[] = []
	for (const pair of pairs) {
		const uuidValue = await query.any.getAttribute(node, { name: pair.attribute.uuid })
		if (!uuidValue) continue
		const name = await resolveTargetName(query, uuidValue, pair.target)
		if (name === undefined) continue
		parts.push(`${pair.attribute.uuid}=${name}`)
	}
	return parts.length > 0 ? parts.sort().join('|') : undefined
}

async function resolveTargetName(
	query: Core.Query<Config>,
	uuidValue: string,
	targetTags: readonly string[],
): Promise<string | undefined> {
	for (const tagName of targetTags) {
		const matches = await query.findByAttributes({
			tagName: tagName as Parameters<typeof query.findByAttributes>[0]['tagName'],
			attributes: { uuid: uuidValue } as Record<string, string>,
		})
		const target = matches[0]
		if (target) {
			const name = await query.any.getAttribute(target, { name: 'name' })
			return name || undefined
		}
	}
	return undefined
}

function addedNode(node: AnyTreeRecord): DiffNode {
	const children: DiffNode[] = node.tree.map((child) => addedNode(child))
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
