import { matchChild } from './match-child'
import { collectUuids, indexByMatchKey } from './match-key'
import { projectOwnedAttributes } from './project-owned-attributes'
import { indexRedirectedSourceUuids } from './reference-match'
import { acceptsRemoval, classifyUnmatched } from './removal-base'
import { visibleAttributes } from './visible-attributes'

import { toRef } from '@dialecte/core/helpers'

import { KEEP_ON_ORPHAN_REFS, REFERENCE_TAG_NAMES } from '@/v2019C1/constants/reference-pairs'
import { resolvePlacementCollision } from '@/v2019C1/extensions/lifecycle/constraints'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { deep } from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type { AcceptedIds, CollisionOverrides } from './decide.types'
import type { PinnedMatches } from './match-child.types'
import type { RedirectedSourceUuids } from './reference-match.types'
import type { RemovalBase } from './removal-base.types'
import type { Config } from '@/v2019C1/config'
import type { Scl } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { ScenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord, AnyTreeRecord, OmitEntry } from '@dialecte/core'

/**
 * Engine apply-core: reconcile an updated template subtree
 * (`sourceRootRef`) ONTO an existing instance (`instanceRootRef`) instead of
 * duplicating it. Elements match by `templateUuid` (= the source element's
 * `uuid`, immutable across template versions):
 *
 *  - matched element    -> update its user-visible attributes in place
 *  - new source element -> add its subtree under the matched parent
 *    (`transplant.deep` + `writeIdentity` stamp)
 *  - instance element whose template lineage no longer exists in the source
 *    -> delete
 *
 * This is the "project then diff" apply half: because the instance is already
 * in instance-space, comparing source (template) to instance is clean once
 * identity + the project-owned `name` are excluded. Deliberately scoped: no
 * reference reconciliation and no multi-instance anchor disambiguation yet.
 */

export async function reconcile(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		sourceRootRef: AnyRefOrRecord
		instanceRootRef: AnyRefOrRecord
		/**
		 * When present, only elements in these accepted record-id sets are written
		 * (full-track decision gating). Omit to apply every change (fast track).
		 */
		accepted?: AcceptedIds
		/**
		 * User-edited values per source element id (full track). Applied to a added
		 * element before its placement collision is resolved. Omit for auto-resolve only.
		 */
		overrides?: CollisionOverrides
		/** Type-dedup name authority for added subtrees, forwarded to `importTypes`. */
		keepNameTypesFrom?: KeepNameTypesFrom
		/** How instance elements match source: the scenario's key. */
		matchKey: MatchKey
		/** Identity write mode for added elements: the scenario's. */
		identityMode: ScenarioPolicy['identityMode']
		/** An added element whose name a sibling holds is numbered. */
		bumpsCollisions: boolean
		/** What tells an element the source dropped from one the project added: see `classifyUnmatched`. */
		removalBase: RemovalBase
		/** Whose names a matched element keeps: see `visibleAttributes`. */
		namesFollow: NamesFollow
		/**
		 * Child tags to treat as BOUNDARIES: their subtrees are left untouched (not reconciled,
		 * added, or deleted) because another pass owns them (e.g. the topology frame reconcile
		 * delegates Application/Function to the fn/app cascade).
		 */
		omit?: readonly string[]
		/**
		 * Source elements mapped onto elements the project already holds: a reference of the instance
		 * to such a project element is the template's reference to the source element.
		 */
		redirectMappings?: readonly RedirectMapping[]
		/**
		 * The instance root is an element of the PROJECT that the source root is mapped onto (a shared
		 * element such as an `AllocationRole`), not an instance of it: its own attributes are never
		 * written. Only what the source contributes below it is reconciled: a named container lands on
		 * the project's container of the same name (whose attributes are the project's too), and
		 * nothing the element holds besides is removed.
		 */
		instanceRootIsProjectOwned?: boolean
		/**
		 * Never remove a reference child implicitly. Set for a SHARED element, whose other reference
		 * children belong to other primaries, other instances or the project itself: one is removed
		 * only when its removal was reported and accepted.
		 */
		keepLeftoverRefs?: boolean
		/**
		 * Source elements below the root whose counterpart is decided elsewhere (a structural level
		 * stands on the level its instance holds for it): matched to that element, or new.
		 */
		pinnedMatches?: PinnedMatches
		/**
		 * Reference children of the instance root's subtree that belong to ANOTHER instance of the same
		 * template (a shared element holds one reference per instance): never matched to a source child.
		 */
		foreignInstanceIds?: ReadonlySet<string>
	},
): Promise<Scl.CloneMapping[]> {
	const {
		sourceQuery,
		sourceRootRef,
		instanceRootRef,
		accepted,
		overrides,
		keepNameTypesFrom,
		matchKey,
		identityMode,
		bumpsCollisions,
		omit,
	} = params
	const keepLeftoverRefs = params.keepLeftoverRefs ?? false
	const withinProjectOwned = params.instanceRootIsProjectOwned ?? false

	// each source record this reconcile ADDS and the copy made of it (root + descendants of each
	// grafted subtree). Matched elements are updated in place, so the consumer already keys them by
	// their own `instanceRef`; only additions are clones.
	const added: Scl.CloneMapping[] = []

	const sourceTree = await sourceQuery.any.getTree(sourceRootRef)
	const instanceTree = await tx.any.getTree(instanceRootRef)
	if (!sourceTree || !instanceTree) return added

	const index = new Map<string, AnyTreeRecord>()
	await indexByMatchKey(tx, { node: instanceTree, index, matchKey })

	const sourceUuids = new Set<string>()
	await collectUuids(sourceQuery, { node: sourceTree, out: sourceUuids })

	const redirectedSourceUuids = await indexRedirectedSourceUuids(tx, params.redirectMappings)

	// root + descendants: update matched in place, add new
	if (!withinProjectOwned) {
		const renamed = await updateMatchedAttributes(tx, {
			sourceQuery,
			instanceRecord: instanceTree,
			sourceNode: sourceTree,
			accepted,
			overrides,
			namesFollow: params.namesFollow,
		})
		// a name written that a sibling of the project already holds is numbered, as a placed element's is
		if (renamed && bumpsCollisions) {
			await resolvePlacementCollision(tx, { ref: toRef(instanceTree) as Scl.Ref<Scl.ElementsOf> })
		}
	}
	await reconcileChildren(tx, {
		sourceQuery,
		sourceNode: sourceTree,
		instanceParent: instanceTree,
		index,
		accepted,
		overrides,
		keepNameTypesFrom,
		matchKey,
		identityMode,
		bumpsCollisions,
		namesFollow: params.namesFollow,
		omit,
		added,
		redirectedSourceUuids,
		keepLeftoverRefs,
		withinProjectOwned,
		pinnedMatches: params.pinnedMatches,
		foreignInstanceIds: params.foreignInstanceIds,
	})

	// removed from the template: delete instance elements whose lineage is gone. In a project-owned
	// element, an identified child the source does not know is another template's or the project's.
	if (!withinProjectOwned) {
		await deleteRemoved(tx, {
			instanceNode: instanceTree,
			sourceUuids,
			accepted,
			matchKey,
			removalBase: params.removalBase,
			omit,
		})
	}

	return added
}

async function reconcileChildren(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		sourceNode: AnyTreeRecord
		instanceParent: AnyTreeRecord
		index: Map<string, AnyTreeRecord>
		accepted: AcceptedIds | undefined
		overrides: CollisionOverrides | undefined
		keepNameTypesFrom: KeepNameTypesFrom | undefined
		matchKey: MatchKey
		identityMode: ScenarioPolicy['identityMode']
		bumpsCollisions: boolean
		namesFollow: NamesFollow
		omit: readonly string[] | undefined
		/** Accumulates the clone mappings of every element added below here (root + subtree). */
		added: Scl.CloneMapping[]
		redirectedSourceUuids: RedirectedSourceUuids
		keepLeftoverRefs: boolean
		/** The children sit in an element of the project a source element is mapped onto. */
		withinProjectOwned: boolean
		pinnedMatches?: PinnedMatches
		foreignInstanceIds?: ReadonlySet<string>
	},
): Promise<void> {
	const {
		sourceQuery,
		sourceNode,
		instanceParent,
		index,
		accepted,
		overrides,
		keepNameTypesFrom,
		matchKey,
		identityMode,
		bumpsCollisions,
		namesFollow,
		omit,
		added,
		redirectedSourceUuids,
		keepLeftoverRefs,
		withinProjectOwned,
	} = params
	const matchedInstanceIds = new Set<string>()
	// the children renamed here, numbered once every rename of this parent is written
	const renamedChildren: AnyTreeRecord[] = []
	for (const sourceChild of sourceNode.tree) {
		// a boundary tag is owned by another pass (e.g. fn/app cascade) - leave it untouched
		if (omit?.includes(sourceChild.tagName)) continue
		// The SAME matcher the diff (report) side uses, so apply pairs children identically: lineage
		// with the cross-type guard, reference identity (uuid then name), then positional fallback.
		const matched = await matchChild(sourceQuery, {
			targetQuery: tx,
			sourceChild,
			instanceParent,
			index,
			matchedInstanceIds,
			matchKey,
			redirectedSourceUuids,
			matchContainersByName: withinProjectOwned,
			pinnedMatches: params.pinnedMatches,
			foreignInstanceIds: params.foreignInstanceIds,
		})

		if (matched) {
			matchedInstanceIds.add(matched.id)
			// a container found by its name is the project's own: its attributes are not written
			const isProjectContainer =
				withinProjectOwned &&
				!REFERENCE_TAG_NAMES.has(sourceChild.tagName) &&
				!(await carriesLineageOf(tx, { sourceQuery, sourceNode: sourceChild, matched, matchKey }))
			if (!isProjectContainer) {
				const renamed = await updateMatchedAttributes(tx, {
					sourceQuery,
					instanceRecord: matched,
					sourceNode: sourceChild,
					accepted,
					overrides,
					namesFollow,
				})
				if (renamed) renamedChildren.push(matched)
			}
			await reconcileChildren(tx, {
				sourceQuery,
				sourceNode: sourceChild,
				instanceParent: matched,
				index,
				accepted,
				overrides,
				keepNameTypesFrom,
				matchKey,
				identityMode,
				bumpsCollisions,
				namesFollow,
				omit,
				added,
				redirectedSourceUuids,
				keepLeftoverRefs,
				withinProjectOwned,
				pinnedMatches: params.pinnedMatches,
				foreignInstanceIds: params.foreignInstanceIds,
			})
			continue
		}

		// add a new template element (with its subtree/companions via deep) — up to the boundary tags,
		// which their own pass places
		if (accepted && !accepted.sourceIds.has(sourceChild.id)) continue

		const { cloneMappings } = await deep(tx, {
			sourceQuery,
			ref: toRef(sourceChild) as unknown as Scl.Ref<Scl.ElementsOf>,
			targetParent: toRef(instanceParent) as unknown as Scl.Ref<Scl.ElementsOf>,
			...(omit ? { omit: [...omit] as OmitEntry<Config>[] } : {}),
			withTypes: { keepNameFrom: keepNameTypesFrom },
		})
		// keep the clone mappings of the whole grafted subtree (ids are stable; the collision
		// bump below only edits the added root's name, never its id).
		added.push(...cloneMappings)
		// stamp/preserve keep the fresh clone uuid + repoint refs; keep/fork converges to the
		// source revision's uuids (no remap) — the shared finalization owns that split.
		await finalizeClonedIdentity(tx, { cloneMappings, mode: identityMode })

		// validate the added element against its instance-parent context: apply any
		// user edit then auto-resolve a name collision among siblings (schema constraint)
		const addRoot = cloneMappings.find((mapping) => mapping.source.id === sourceChild.id)
		if (addRoot && bumpsCollisions) {
			await resolvePlacementCollision(tx, {
				ref: addRoot.target,
				parentRef: toRef(instanceParent) as unknown as Scl.Ref<Scl.ElementsOf>,
				overrides: overrides?.get(sourceChild.id),
			})
		}
	}

	// a name written that a sibling already holds is numbered, as a placed element's is — once every rename of the
	// parent is written, so two children trading names need no number (`numberRenames` says the same in the report)
	for (const renamed of bumpsCollisions ? renamedChildren : []) {
		await resolvePlacementCollision(tx, { ref: toRef(renamed) as Scl.Ref<Scl.ElementsOf> })
	}

	// Unmatched instance children with no lineage under the scenario's key:
	//  - a REFERENCE (link) tag = a dropped link → removed (fast track removes it; the
	//    full track gates on the removed node's acceptance);
	//  - any other tag = an author-added TARGET-ONLY element → preserved by default and
	//    removed ONLY when its own decision group is explicitly accepted.
	// Identified removals (lineage gone) are handled by `deleteRemoved`.
	for (const instanceChild of instanceParent.tree) {
		if (matchedInstanceIds.has(instanceChild.id)) continue
		// a boundary tag is owned by another pass - never delete it here
		if (omit?.includes(instanceChild.tagName)) continue
		const lineage = await tx.any.getAttribute(instanceChild, { name: matchKey })
		if (lineage) continue
		if (
			REFERENCE_TAG_NAMES.has(instanceChild.tagName) &&
			!KEEP_ON_ORPHAN_REFS.has(instanceChild.tagName)
		) {
			// a shared element's other links are not this template's to drop: explicit accept only
			if (keepLeftoverRefs && !accepted) continue
			if (accepted && !accepted.instanceIds.has(instanceChild.id)) continue
		} else {
			// never remove an author addition implicitly — require an explicit accept
			if (!accepted || !accepted.instanceIds.has(instanceChild.id)) continue
		}

		const live = await tx.any.getRecord(instanceChild)
		if (live) await tx.any.delete(instanceChild)
	}
}

/** Whether an instance element was created from a source element: it carries its uuid as lineage. */
async function carriesLineageOf(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		sourceNode: AnyTreeRecord
		matched: AnyTreeRecord
		matchKey: MatchKey
	},
): Promise<boolean> {
	const { sourceQuery, sourceNode, matched, matchKey } = params
	const sourceUuid = await sourceQuery.any.getAttribute(sourceNode, { name: 'uuid' })
	if (!sourceUuid) return false
	const lineage = await tx.any.getAttribute(matched, { name: matchKey })
	return lineage === sourceUuid
}

async function deleteRemoved(
	tx: Core.Transaction<Config>,
	params: {
		instanceNode: AnyTreeRecord
		sourceUuids: ReadonlySet<string>
		accepted: AcceptedIds | undefined
		matchKey: MatchKey
		removalBase: RemovalBase
		omit: readonly string[] | undefined
	},
): Promise<void> {
	const { instanceNode, sourceUuids, accepted, matchKey, removalBase, omit } = params
	const toDelete: AnyTreeRecord[] = []
	await collectRemoved(tx, {
		node: instanceNode,
		sourceUuids,
		accepted,
		matchKey,
		removalBase,
		omit,
		out: toDelete,
	})

	for (const record of toDelete) {
		// Idempotent: deleting a parent cascades its children, so a later child
		// ref may already be gone.
		const live = await tx.any.getRecord(record)
		if (live) await tx.any.delete(record)
	}
}

async function collectRemoved(
	tx: Core.Transaction<Config>,
	params: {
		node: AnyTreeRecord
		sourceUuids: ReadonlySet<string>
		accepted: AcceptedIds | undefined
		matchKey: MatchKey
		removalBase: RemovalBase
		omit: readonly string[] | undefined
		out: AnyTreeRecord[]
	},
): Promise<void> {
	const { node, sourceUuids, accepted, matchKey, removalBase, omit, out } = params
	// a boundary subtree is owned by another pass - do not delete or descend into it
	if (omit?.includes(node.tagName)) return
	const lineage = await tx.any.getAttribute(node, { name: matchKey })
	const unmatched = lineage
		? classifyUnmatched({ lineage, inSource: sourceUuids.has(lineage), removalBase })
		: 'still-held'
	// one atomic group, its subtree cascading with it (do not descend): a removal is written unless it was
	// skipped, an element of the project's own only when its removal was accepted
	if (unmatched !== 'still-held') {
		if (acceptsRemoval({ change: unmatched, id: node.id, accepted })) out.push(node)
		return
	}
	for (const child of node.tree) {
		await collectRemoved(tx, {
			node: child,
			sourceUuids,
			accepted,
			matchKey,
			removalBase,
			omit,
			out,
		})
	}
}

/** Write the template's visible attributes on a matched element. Returns whether its name was written. */
async function updateMatchedAttributes(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		instanceRecord: AnyTreeRecord
		sourceNode: AnyTreeRecord
		accepted?: AcceptedIds
		overrides?: CollisionOverrides
		namesFollow: NamesFollow
	},
): Promise<boolean> {
	const { sourceQuery, instanceRecord, sourceNode, accepted, overrides, namesFollow } = params
	if (accepted && !accepted.sourceIds.has(sourceNode.id)) return false

	// The template's attributes, with the user's value edits overlaid (so an in-place
	// update honors an edited `desc`/`name` just like a freshly added element does).
	const sourceAttributes = await sourceQuery.any.getAttributes(sourceNode)
	const instanceAttributes = await tx.any.getAttributes(instanceRecord)
	const desired = {
		...visibleAttributes({
			tagName: sourceNode.tagName,
			attributes: sourceAttributes,
			namesFollow,
		}),
		...overrides?.get(sourceNode.id),
	}
	const current = visibleAttributes({
		tagName: instanceRecord.tagName,
		attributes: instanceAttributes,
		namesFollow,
	})
	// what the project owns on the element (a bound LNode's implementation and type) is never
	// written, even when a user edit overlaid above lists it
	const owned = projectOwnedAttributes({ tagName: instanceRecord.tagName, instanceAttributes })

	// Union of both sides: a name present on the template overwrites, a name the
	// template dropped (present on the instance, absent from `desired`) is cleared
	// (`undefined` removes it) — otherwise a reconcile would leave a stale instance value.
	const updates: Record<string, string | undefined> = {}
	for (const name of new Set([...Object.keys(desired), ...Object.keys(current)])) {
		const next = name in desired ? desired[name] : undefined
		if (owned.attributes.has(name)) continue
		if (current[name] !== next) updates[name] = next
	}

	if (Object.keys(updates).length > 0) {
		// `update` removes an attribute on an `undefined` value; the AnyTransaction param is
		// typed string-only, so cast the dynamic map (matches the repo's `as Record` pattern).
		await tx.any.update(instanceRecord, { attributes: updates as Record<string, string> })
	}
	// the update went through the transaction: every path naming a renamed element follows
	return 'name' in updates
}
