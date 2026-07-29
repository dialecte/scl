import { visibleAttributes } from './visible-attributes'

import { toRef } from '@dialecte/core/helpers'

import { KEEP_ON_ORPHAN_REFS, REFERENCE_TAG_NAMES } from '@/v2019C1/constants/reference-pairs'
import { isLNodeLocked } from '@/v2019C1/extensions/data-model/query'
import { writeIdentity } from '@/v2019C1/extensions/identity/transaction'
import { resolvePlacementCollision } from '@/v2019C1/extensions/lifecycle/constraints'
import { deep } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { LOCKED_LNODE_ATTRIBUTES } from '@/v2019C1/extensions/reference'

import type { AcceptedIds, CollisionOverrides } from './decide.types'
import type { Config } from '@/v2019C1/config'
import type { Scl } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { IdentityMode } from '@/v2019C1/extensions/identity/transaction/write-identity.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * Engine apply-core (ENGINE.md §3/§8): reconcile an updated template subtree
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
		/** How instance elements match source. `templateUuid` (default) or `uuid` (fork). */
		matchKey?: MatchKey
		/** Identity write mode for grafted elements. `stamp-template` (default) or `keep` (fork). */
		identityMode?: IdentityMode
	},
): Promise<void> {
	const {
		sourceQuery,
		sourceRootRef,
		instanceRootRef,
		accepted,
		overrides,
		keepNameTypesFrom,
		matchKey = 'templateUuid',
		identityMode = 'stamp-template',
	} = params

	const sourceTree = await sourceQuery.any.getTree(sourceRootRef)
	const instanceTree = await tx.any.getTree(instanceRootRef)
	if (!sourceTree || !instanceTree) return

	const index = new Map<string, AnyTreeRecord>()
	await indexByMatchKey(tx, { node: instanceTree, index, matchKey })

	const sourceUuids = new Set<string>()
	await collectUuids(sourceQuery, { node: sourceTree, out: sourceUuids })

	// root + descendants: update matched in place, add new
	await updateMatchedAttributes(tx, {
		sourceQuery,
		instanceRecord: instanceTree,
		sourceNode: sourceTree,
		accepted,
		overrides,
	})
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
	})

	// removed from the template: delete instance elements whose lineage is gone
	await deleteRemoved(tx, { instanceNode: instanceTree, sourceUuids, accepted, matchKey })
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
		identityMode: IdentityMode
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
	} = params
	const matchedInstanceIds = new Set<string>()
	for (const sourceChild of sourceNode.tree) {
		const sourceUuid = await sourceQuery.any.getAttribute(sourceChild, { name: 'uuid' })
		// Match by templateUuid lineage; fall back to a same-tag unmatched sibling
		// for uuid-less elements (e.g. FunctionRoleContent) so they are reconciled
		// in place, not re-added as duplicates.
		const matched =
			(sourceUuid ? index.get(sourceUuid) : undefined) ??
			(sourceUuid
				? undefined
				: instanceParent.tree.find(
						(instanceChild) =>
							instanceChild.tagName === sourceChild.tagName &&
							!matchedInstanceIds.has(instanceChild.id),
					))

		if (matched) {
			matchedInstanceIds.add(matched.id)
			await updateMatchedAttributes(tx, {
				sourceQuery,
				instanceRecord: matched,
				sourceNode: sourceChild,
				accepted,
				overrides,
			})
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
			})
			continue
		}

		// add a new template element (with its subtree/companions via deep)
		if (accepted && !accepted.sourceIds.has(sourceChild.id)) continue

		const { recordMappings } = await deep(tx, {
			sourceQuery,
			ref: toRef(sourceChild) as unknown as Scl.Ref<Scl.ElementsOf>,
			targetParent: toRef(instanceParent) as unknown as Scl.Ref<Scl.ElementsOf>,
			strip: false,
			withTypes: { keepNameFrom: keepNameTypesFrom },
		})
		await writeIdentity(tx, { mappings: recordMappings, mode: identityMode })

		// validate the added element against its instance-parent context: apply any
		// user edit then auto-resolve a name collision among siblings (schema constraint).
		// Fork keeps identity (same-file revision) — no re-stamp, no collision bump.
		const addRoot = recordMappings.find((mapping) => mapping.source.id === sourceChild.id)
		if (addRoot && identityMode !== 'keep') {
			await resolvePlacementCollision(tx, {
				ref: addRoot.target,
				parentRef: toRef(instanceParent) as unknown as Scl.Ref<Scl.ElementsOf>,
				overrides: overrides?.get(sourceChild.id),
			})
		}
	}

	// Unmatched instance children with no `templateUuid`:
	//  - a REFERENCE (link) tag = a dropped link → removed (fast track removes it; the
	//    full track gates on the removed node's acceptance);
	//  - any other tag = an author-added TARGET-ONLY element → preserved by default and
	//    removed ONLY when its own decision group is explicitly accepted.
	// Identified removals (templateUuid lineage gone) are handled by `deleteRemoved`.
	for (const instanceChild of instanceParent.tree) {
		if (matchedInstanceIds.has(instanceChild.id)) continue
		const templateUuid = await tx.any.getAttribute(instanceChild, { name: 'templateUuid' })
		if (templateUuid) continue
		if (
			REFERENCE_TAG_NAMES.has(instanceChild.tagName) &&
			!KEEP_ON_ORPHAN_REFS.has(instanceChild.tagName)
		) {
			if (accepted && !accepted.instanceIds.has(instanceChild.id)) continue
		} else {
			// never remove an author addition implicitly — require an explicit accept
			if (!accepted || !accepted.instanceIds.has(instanceChild.id)) continue
		}

		const live = await tx.any.getRecord(instanceChild)
		if (live) await tx.any.delete(instanceChild)
	}
}

async function deleteRemoved(
	tx: Core.Transaction<Config>,
	params: {
		instanceNode: AnyTreeRecord
		sourceUuids: ReadonlySet<string>
		accepted: AcceptedIds | undefined
		matchKey: MatchKey
	},
): Promise<void> {
	const { instanceNode, sourceUuids, accepted, matchKey } = params
	const toDelete: AnyTreeRecord[] = []
	await collectRemoved(tx, { node: instanceNode, sourceUuids, accepted, matchKey, out: toDelete })

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
		out: AnyTreeRecord[]
	},
): Promise<void> {
	const { node, sourceUuids, accepted, matchKey, out } = params
	const lineage = await tx.any.getAttribute(node, { name: matchKey })
	if (lineage && !sourceUuids.has(lineage)) {
		// removed subtree = one atomic group; delete only if that group is accepted
		if (!accepted || accepted.instanceIds.has(node.id)) out.push(node)
		return // its subtree cascades with it; do not descend
	}
	for (const child of node.tree) {
		await collectRemoved(tx, { node: child, sourceUuids, accepted, matchKey, out })
	}
}

async function updateMatchedAttributes(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		instanceRecord: AnyTreeRecord
		sourceNode: AnyTreeRecord
		accepted?: AcceptedIds
		overrides?: CollisionOverrides
	},
): Promise<void> {
	const { sourceQuery, instanceRecord, sourceNode, accepted, overrides } = params
	if (accepted && !accepted.sourceIds.has(sourceNode.id)) return

	// The template's attributes, with the user's value edits overlaid (so an in-place
	// update honors an edited `desc`/`name` just like a freshly added element does).
	const desired = {
		...visibleAttributes(await sourceQuery.any.getAttributes(sourceNode)),
		...overrides?.get(sourceNode.id),
	}
	const current = visibleAttributes(await tx.any.getAttributes(instanceRecord))

	// Union of both sides: a name present on the template overwrites, a name the
	// template dropped (present on the instance, absent from `desired`) is cleared
	// (`undefined` removes it) — otherwise a reconcile would leave a stale instance value.
	const updates: Record<string, string | undefined> = {}
	for (const name of new Set([...Object.keys(desired), ...Object.keys(current)])) {
		const next = name in desired ? desired[name] : undefined
		if (current[name] !== next) updates[name] = next
	}

	// A locked LNode (implemented in an IED) owns its identity + `lnType` — never let a
	// template reconcile (or a user edit overlaid above) overwrite any of them.
	if (
		instanceRecord.tagName === 'LNode' &&
		Object.keys(updates).some((attr) => LOCKED_LNODE_ATTRIBUTES.has(attr)) &&
		(await isLNodeLocked(tx, instanceRecord))
	) {
		for (const attr of LOCKED_LNODE_ATTRIBUTES) delete updates[attr]
	}

	if (Object.keys(updates).length > 0) {
		// `update` removes an attribute on an `undefined` value; the AnyTransaction param is
		// typed string-only, so cast the dynamic map (matches the repo's `as Record` pattern).
		await tx.any.update(instanceRecord, { attributes: updates as Record<string, string> })
	}
}

async function indexByMatchKey(
	tx: Core.Transaction<Config>,
	params: { node: AnyTreeRecord; index: Map<string, AnyTreeRecord>; matchKey: MatchKey },
): Promise<void> {
	const { node, index, matchKey } = params
	const key = await tx.any.getAttribute(node, { name: matchKey })
	if (key) index.set(key, node)
	for (const child of node.tree) await indexByMatchKey(tx, { node: child, index, matchKey })
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
