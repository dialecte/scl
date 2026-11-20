import { contributesChild } from './contributed-children'
import { createConfRevBumpQueue, remapCopies, writeDataSetChange } from './data-set-order'
import { findDeletedDataReferrers, writeDeletedDataReferrers } from './deleted-data-referrers'
import { matchChild } from './match-child'
import { collectUuids, indexByMatchKey } from './match-key'
import { findMovedInAdded, movableSourceUuids, topmostBelow, writeMoves } from './moved'
import { pairByKeyOnLineageMiss } from './pair-by-key'
import { createPairingMemo } from './pairing-memo'
import { projectOwnedAttributes } from './project-owned-attributes'
import { indexRedirectedSourceUuids } from './reference-match'
import { acceptsRemoval, classifyUnmatched, classifyUnpairedReference } from './removal-base'
import { readTargetLineages } from './target-lineages'
import { reconcileTextWrappers } from './text-wrappers'
import { createTypeComparison, typeChangesOf } from './type-change'
import { compareText, readValueOwnership } from './value-ownership'
import { visibleAttributes } from './visible-attributes'
import { landingParent } from './wrapper'

import { throwDialecteError } from '@dialecte/core'
import { toRef } from '@dialecte/core/helpers'

import { KEEP_ON_ORPHAN_REFS } from '@/v2019C1/constants/reference-pairs'
import { importTypes } from '@/v2019C1/extensions/data-model/transaction'
import {
	assertNoIdentityCollision,
	resolvePlacementCollision,
} from '@/v2019C1/extensions/lifecycle/constraints'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { leaveOutUndeclaredNodes } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope'
import {
	readTemplateBlocks,
	writeConfRevBumps,
} from '@/v2019C1/extensions/lifecycle/layers/ied/bump-data-set-conf-revs'
import { deep } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { DISPOSABLE_REFERENCE_TAGS } from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'
import { readAttribute } from '@/v2019C1/helpers'

import type { ConfRevBumpQueue } from './data-set-order.types'
import type { AcceptedIds, CollisionOverrides } from './decide.types'
import type { ChildMatch, PinnedMatches } from './match-child.types'
import type { PendingMove } from './moved.types'
import type { PlaceholderLineages } from './placeholder-lineages.types'
import type { ReconcileBeforeRemovals } from './reconcile.types'
import type { ReconcileAdditions, ReconcileResult } from './reconcile.types'
import type { RedirectedSourceUuids } from './reference-match.types'
import type { RemovalBase } from './removal-base.types'
import type { TargetLineages } from './target-lineages.types'
import type { TypeFollowing } from './type-change.types'
import type { ValueOwnership } from './value-ownership.types'
import type { Config } from '@/v2019C1/config'
import type { Scl } from '@/v2019C1/config'
import type {
	KeepNameTypesFrom,
	LogicalNodeRecord,
	TypeFollower,
} from '@/v2019C1/extensions/data-model/transaction'
import type { FindIdentityCollisionParams } from '@/v2019C1/extensions/lifecycle/constraints/find-identity-collision.types'
import type { TakeOvers } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { TemplateBlocks } from '@/v2019C1/extensions/lifecycle/layers/ied/bump-data-set-conf-revs.types'
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
		/** An added element whose name a sibling holds is numbered. */
		bumpsCollisions: boolean
		/** What tells an element the source dropped from one the project added: see `classifyUnmatched`. */
		removalBase: RemovalBase
		/** Whose names a matched element keeps: see `visibleAttributes`. */
		namesFollow: NamesFollow
		/**
		 * On a contribution: below a container of these tags the project already holds (one the contribution lands on), only
		 * the children of the tags listed are contributed; the rest is the container's own (a subnetwork's settings).
		 */
		contributedChildren?: ReadonlyMap<string, ReadonlySet<string>>
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
		/**
		 * The source elements the instance's selection of functional variants leaves out (record ids): one matching
		 * nothing in the instance is neither listed nor written, at any depth; one the instance holds is compared as any.
		 */
		notSelected?: ReadonlySet<string>
		/** The lineages a reference of the project may pair by name on: see `PlaceholderLineages`. Default none. */
		placeholderLineages?: PlaceholderLineages
		/** The source is the project itself (a copy): a uuid both name is one element, never a reference this walk wrote. */
		sourceIsProject?: boolean
		/**
		 * Run once the walk has added and moved what it writes, before the removals: what a later pass moves out of a
		 * removed element (a primary of a process section) goes first, given what the walk added (a level it lands in).
		 */
		beforeRemovals?: ReconcileBeforeRemovals
		/** The values the project keeps that the consumer takes the template's for: see `Resolution.takeOver`. */
		takeOver?: TakeOvers
	} & ReconcileAdditions,
): Promise<ReconcileResult> {
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
	const contributeOnly = params.contributeOnly ?? false
	const keepLeftoverRefs = contributeOnly || (params.keepLeftoverRefs ?? false)
	const withinProjectOwned = contributeOnly || (params.instanceRootIsProjectOwned ?? false)

	// each source record this reconcile ADDS and the copy made of it (root + descendants of each
	// grafted subtree). Matched elements are updated in place, so the consumer already keys them by
	// their own `instanceRef`; only additions are clones.
	const added: Scl.CloneMapping[] = []
	// where a contribution's identified source elements landed in the project
	const landedOn: RedirectMapping[] = []

	const sourceTree = await sourceQuery.any.getTree(sourceRootRef)
	const instanceTree = await tx.any.getTree(instanceRootRef)
	// nothing to reconcile on either side: nothing added, so `beforeRemovals` has nothing to place either
	if (!sourceTree || !instanceTree) return { cloneMappings: added, landedOn }
	// a terminal naming a node no file of the template holds is never added: the report left it out the same way
	const { notSelected } = leaveOutUndeclaredNodes({
		tree: sourceTree,
		notSelected: params.notSelected,
		omit,
	})

	const index = new Map<string, AnyTreeRecord>()
	await indexByMatchKey(tx, { node: instanceTree, index, matchKey })

	const sourceUuids = new Set<string>()
	await collectUuids(sourceQuery, { node: sourceTree, out: sourceUuids })

	const redirected = await indexRedirectedSourceUuids(tx, params.redirectMappings)
	// in an IED, what the template names by uuids the instance's lineages do not know, paired by key before the walk
	const byKey = pairByKeyOnLineageMiss({ sourceTree, instanceTree, index, sourceUuids, matchKey })
	// what the caller decided wins over the key pass
	const redirectedSourceUuids = new Map([...byKey.redirectedSourceUuids, ...redirected])
	// the template's control blocks, by uuid, from its tree as held: a data set change raises the project's against them
	const templateBlocks = readTemplateBlocks({ sourceTree })
	// read before the first write: the references the instance held, as the report read them
	const targetLineages = await readTargetLineages(tx, {
		nodes: [instanceTree],
		matchKey,
		referrerTags: DISPOSABLE_REFERENCE_TAGS,
	})
	// the matched elements whose type the template changed, brought in one import once the walk is done
	const typeFollowing: TypeFollowing = { comparison: createTypeComparison(), followers: [] }
	// a reference naming data the update deletes is written as its decision says, before the walk removes the data
	const referrers = await findDeletedDataReferrers(tx, {
		sourceQuery,
		sourceTree,
		instanceTree,
		sourceUuids,
		movable: movableSourceUuids({ sourceTree, omit, notSelected }),
		matchKey,
		removalBase: params.removalBase,
		typeComparison: typeFollowing.comparison,
	})
	// the configuration revisions the walk raises, written once it is done: an entry removed here raises its senders too
	const confRevBumps = createConfRevBumpQueue()
	const written = await writeDeletedDataReferrers(tx, { referrers, accepted })
	confRevBumps.defer(written.confRevBumps)
	// an input cleared above stays: the walk does not take its acceptance for the removal of a project element
	const walkAccepted = withoutIds({ accepted, ids: written.cleared })
	// what the project keeps of the template's values, as the report reads them
	const valueOwnership = await readValueOwnership(sourceQuery, {
		sourceTree,
		instanceTree,
		matchKey,
		takeOver: params.takeOver,
		namesFollow: params.namesFollow,
	})
	// a fork: the references the newer revision re-targets onto an element the document now holds
	// a fork of the file itself: the re-target scope the update holds, read once at its entry, as the report read it
	const retargetUuids = 'holds' in params.removalBase ? params.removalBase.holds : undefined

	// root + descendants: update matched in place, add new
	if (!withinProjectOwned) {
		const renamed = await updateMatchedAttributes(tx, {
			sourceQuery,
			instanceRecord: instanceTree,
			sourceNode: sourceTree,
			accepted,
			overrides,
			namesFollow: params.namesFollow,
			retargetUuids,
			typeFollowing,
			valueOwnership,
		})
		await reconcileTextWrappers(tx, {
			sourceQuery,
			sourceNode: sourceTree,
			instanceRecord: instanceTree,
			accepted,
		})
		// a name written that a sibling of the project already holds is numbered, as a placed element's is. A rename
		// writes editable fields only: a key it leaves colliding has none, the project held it so before
		if (renamed && bumpsCollisions) {
			await resolvePlacementCollision(tx, { ref: toRef(instanceTree) as Scl.Ref<Scl.ElementsOf> })
		}
	}
	// what an addition leaves colliding on a key nothing can change, read again once the removals are written
	const pendingCollisions: FindIdentityCollisionParams[] = []
	const moves: PendingMove[] = []
	await reconcileChildren(tx, {
		sourceQuery,
		sourceNode: sourceTree,
		instanceParent: instanceTree,
		index,
		accepted: walkAccepted,
		overrides,
		keepNameTypesFrom,
		matchKey,
		targetLineages,
		identityMode,
		bumpsCollisions,
		namesFollow: params.namesFollow,
		retargetUuids,
		omit,
		added,
		pendingCollisions,
		redirectedSourceUuids,
		templateBlocks,
		keepLeftoverRefs,
		withinProjectOwned,
		pinnedMatches: new Map([...byKey.pinnedMatches, ...(params.pinnedMatches ?? [])]),
		keyPairings: new Map(
			[...byKey.keys].filter(([sourceId]) => !params.pinnedMatches?.has(sourceId)),
		),
		confRevBumps,
		foreignInstanceIds: params.foreignInstanceIds,
		notSelected,
		typeFollowing,
		valueOwnership,
		placeholderLineages: params.placeholderLineages ?? new Set(),
		contributeOnly,
		contributedChildren: params.contributedChildren,
		landedOn,
		sourceIsProject: params.sourceIsProject ?? false,
		moves,
	})
	// the moves, once what the walk adds is there to move into, before the removals: a removed parent never takes them
	await writeMoves(tx, { moves })
	// what a later pass moves out of what is removed, before the removals take it
	if (params.beforeRemovals) await params.beforeRemovals({ added })

	// removed from the template: delete instance elements whose lineage is gone. In a project-owned
	// element, an identified child the source does not know is another template's or the project's.
	if (!withinProjectOwned) {
		await deleteRemoved(tx, {
			instanceNode: instanceTree,
			sourceUuids,
			movedIds: new Set(moves.map((move) => move.instance.id)),
			pairedByKey: new Set(byKey.pinnedMatches.values()),
			accepted,
			matchKey,
			removalBase: params.removalBase,
			omit,
		})
	}
	await writeConfRevBumps(tx, { bumps: confRevBumps.list() })
	// the types the matched elements take from the template, through its closure, once what it removes is gone
	if (typeFollowing.followers.length > 0) {
		await importTypes(tx, {
			sourceQuery,
			records: [],
			followers: typeFollowing.followers,
			keepNameTypesFrom,
		})
	}
	// what the template drops, or the project's own element whose removal is accepted, frees the key it held
	await assertNoPendingCollision(tx, { pending: pendingCollisions })

	// an entry a data set written again in order copied is named by its copy
	return {
		cloneMappings: remapCopies({ mappings: added, movedIds: confRevBumps.movedIds() }),
		landedOn,
	}
}

/**
 * Refuse an element an addition left colliding on a key none of whose fields can be changed, read as the reconcile
 * leaves it: one whose twin the same reconcile removed is no collision.
 */
async function assertNoPendingCollision(
	tx: Core.Transaction<Config>,
	params: { pending: readonly FindIdentityCollisionParams[] },
): Promise<void> {
	for (const placed of params.pending) {
		if (!(await tx.getRecord(placed.ref))) continue
		await assertNoIdentityCollision(tx, placed)
	}
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
		/** The lineage of what the instance's references name, read once before the reconcile writes. */
		targetLineages: TargetLineages
		/** The identity written on what is added; none on a contribution, finalized by the placement it is part of. */
		identityMode: ScenarioPolicy['identityMode'] | undefined
		bumpsCollisions: boolean
		namesFollow: NamesFollow
		/** In a fork of the file itself: the uuids a reference may be re-targeted onto (`RemovalBase`'s `holds`). */
		retargetUuids?: ReadonlySet<string>
		omit: readonly string[] | undefined
		/** Accumulates the clone mappings of every element added below here (root + subtree). */
		added: Scl.CloneMapping[]
		/** Accumulates the elements added below here that collide on a key nothing can change. */
		pendingCollisions: FindIdentityCollisionParams[]
		redirectedSourceUuids: RedirectedSourceUuids
		/** The template's control blocks by uuid: see `readTemplateBlocks`. */
		templateBlocks: TemplateBlocks
		keepLeftoverRefs: boolean
		/** The children sit in an element of the project a source element is mapped onto. */
		withinProjectOwned: boolean
		pinnedMatches?: PinnedMatches
		/** The key each source element the key pass pinned was paired on, by its record id. */
		keyPairings?: ReadonlyMap<string, string>
		/** The configuration revisions the walk raises, written once it is done. */
		confRevBumps: ConfRevBumpQueue
		foreignInstanceIds?: ReadonlySet<string>
		notSelected?: ReadonlySet<string>
		typeFollowing: TypeFollowing
		/** What the project keeps of the template's values: see `compareText`. */
		valueOwnership: ValueOwnership
		placeholderLineages: PlaceholderLineages
		/** A first placement onto the project's element: see `reconcile`. */
		contributeOnly: boolean
		/** On a contribution, the children of a held container it brings: see `reconcile`. */
		contributedChildren: ReadonlyMap<string, ReadonlySet<string>> | undefined
		/** Accumulates, on a contribution, where its identified source elements landed. */
		landedOn: RedirectMapping[]
		/** The accepted moves the walk finds, written once it is done (`writeMoves`). */
		moves: PendingMove[]
		sourceIsProject: boolean
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
		pendingCollisions,
		redirectedSourceUuids,
		keepLeftoverRefs,
		withinProjectOwned,
	} = params
	const matchedInstanceIds = new Set<string>()
	// what is read of the instance's children while its source children are paired, read once
	const pairingMemo = createPairingMemo()
	// each source child paired, with the instance child it paired with: the order of a data set's entries
	const pairs = new Map<string, string>()
	// the tags of the children this walk removes: an entry removed changes its data set
	const removedTags: string[] = []
	// the children renamed here, numbered once every rename of this parent is written
	const renamedChildren: AnyTreeRecord[] = []
	for (const sourceChild of sourceNode.tree) {
		// a boundary tag is owned by another pass (e.g. fn/app cascade) - leave it untouched
		if (omit?.includes(sourceChild.tagName)) continue
		// below a container the project holds, a contribution brings only the children it is told to
		if (
			params.contributeOnly &&
			!contributesChild({
				parentTag: sourceNode.tagName,
				childTag: sourceChild.tagName,
				contributedChildren: params.contributedChildren,
			})
		)
			continue
		// The SAME matcher the diff (report) side uses, so apply pairs children identically: lineage
		// with the cross-type guard, reference identity (uuid then name), then positional fallback.
		const match = await matchChild(sourceQuery, {
			targetQuery: tx,
			sourceChild,
			instanceParent,
			index,
			matchedInstanceIds,
			matchKey,
			targetLineages: params.targetLineages,
			redirectedSourceUuids,
			matchContainersByName: withinProjectOwned,
			pinnedMatches: params.pinnedMatches,
			keyPairings: params.keyPairings,
			foreignInstanceIds: params.foreignInstanceIds,
			placeholderLineages: params.placeholderLineages,
			refsAlwaysAdded: params.contributeOnly,
			sourceIsProject: params.sourceIsProject,
			pairingMemo,
		})

		if (match) {
			const matched = match.record
			matchedInstanceIds.add(matched.id)
			pairs.set(sourceChild.id, matched.id)
			// an element paired by key now names the template element it stands for, its group accepted (a fork keeps its
			// own uuid)
			if (
				match.pairedByKey !== undefined &&
				matchKey === 'templateUuid' &&
				(!accepted || accepted.instanceIds.has(matched.id))
			) {
				await restampLineage(tx, { sourceChild, matched })
			}
			if (params.contributeOnly)
				await recordLanding(tx, { sourceQuery, sourceChild, match, landedOn: params.landedOn })
			// a container found by its name is the project's own: its attributes are not written; on a first placement
			// nothing the project holds is rewritten
			const isProjectContainer =
				params.contributeOnly ||
				(withinProjectOwned &&
					!DISPOSABLE_REFERENCE_TAGS.has(sourceChild.tagName) &&
					!(await carriesLineageOf(tx, {
						sourceQuery,
						sourceNode: sourceChild,
						matched,
						matchKey,
					})))
			if (!isProjectContainer) {
				const renamed = await updateMatchedAttributes(tx, {
					sourceQuery,
					instanceRecord: matched,
					sourceNode: sourceChild,
					accepted,
					overrides,
					namesFollow,
					retargetUuids: params.retargetUuids,
					typeFollowing: params.typeFollowing,
					valueOwnership: params.valueOwnership,
				})
				if (renamed) renamedChildren.push(matched)
				await reconcileTextWrappers(tx, {
					sourceQuery,
					sourceNode: sourceChild,
					instanceRecord: matched,
					accepted,
				})
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
				targetLineages: params.targetLineages,
				identityMode,
				bumpsCollisions,
				namesFollow,
				retargetUuids: params.retargetUuids,
				omit,
				added,
				pendingCollisions,
				redirectedSourceUuids,
				templateBlocks: params.templateBlocks,
				keepLeftoverRefs,
				withinProjectOwned,
				pinnedMatches: params.pinnedMatches,
				keyPairings: params.keyPairings,
				confRevBumps: params.confRevBumps,
				foreignInstanceIds: params.foreignInstanceIds,
				notSelected: params.notSelected,
				typeFollowing: params.typeFollowing,
				valueOwnership: params.valueOwnership,
				placeholderLineages: params.placeholderLineages,
				contributeOnly: params.contributeOnly,
				contributedChildren: params.contributedChildren,
				landedOn: params.landedOn,
				sourceIsProject: params.sourceIsProject,
				moves: params.moves,
			})
			// paired with an element under another parent: the source moved it here, written after the walk
			if (
				!instanceParent.tree.some((child) => child.id === matched.id) &&
				(!accepted || accepted.sourceIds.has(sourceChild.id))
			) {
				// dialecte-allow argument-mutation: the walk's accumulator of accepted moves, as `added`
				params.moves.push({
					instance: matched,
					parent: toRef(instanceParent) as Scl.Ref<Scl.ElementsOf>,
				})
			}
			continue
		}

		// add a new template element (with its subtree/companions via deep) — up to the boundary tags,
		// which their own pass places
		// what the instance's selection of variants leaves out is not added, nor what it consumed below an addition
		if (params.notSelected?.has(sourceChild.id)) continue
		if (accepted && !accepted.sourceIds.has(sourceChild.id)) continue

		// what the source holds in a wrapper lands in the instance's wrapper of its type
		const targetParent = await landingParent(tx, { sourceQuery, sourceChild, instanceParent })
		// what the added subtree holds that the instance holds elsewhere moves into the clone, never cloned twice
		const movedInside = findMovedInAdded({
			node: sourceChild,
			index,
			omit,
			notSelected: params.notSelected,
		})
		const leaveOut =
			movedInside.length > 0
				? new Set([...(params.notSelected ?? []), ...movedInside.map((moved) => moved.source.id)])
				: params.notSelected
		const { cloneMappings } = await deep(tx, {
			sourceQuery,
			ref: toRef(sourceChild) as unknown as Scl.Ref<Scl.ElementsOf>,
			targetParent: toRef(targetParent) as unknown as Scl.Ref<Scl.ElementsOf>,
			...(omit ? { omit: [...omit] as OmitEntry<Config>[] } : {}),
			// a contribution pours shared elements and a level's own content: the types are the placement's to bring
			withTypes: params.contributeOnly ? false : { keepNameFrom: keepNameTypesFrom },
			leaveOut,
		})
		for (const moved of movedInside) {
			if (accepted && !accepted.sourceIds.has(moved.source.id)) continue
			const parent = cloneMappings.find(
				(mapping) => mapping.source.id === moved.sourceParent.id,
			)?.target
			// the move depends on the addition of its parent: the decisions are checked before anything is written
			if (!parent) {
				return throwDialecteError('ASSERTION_FAILED', {
					detail: `the move of ${moved.instance.tagName} "${moved.instance.id}" found no clone of its new parent ${moved.sourceParent.tagName} "${moved.sourceParent.id}"`,
				})
			}
			// what the moved element itself changes is written as for any element paired in place: a rename riding on the
			// move, its text, what it holds
			await updateMatchedAttributes(tx, {
				sourceQuery,
				instanceRecord: moved.instance,
				sourceNode: moved.source,
				accepted,
				overrides,
				namesFollow,
				retargetUuids: params.retargetUuids,
				typeFollowing: params.typeFollowing,
				valueOwnership: params.valueOwnership,
			})
			await reconcileTextWrappers(tx, {
				sourceQuery,
				sourceNode: moved.source,
				instanceRecord: moved.instance,
				accepted,
			})
			await reconcileChildren(tx, {
				...params,
				sourceNode: moved.source,
				instanceParent: moved.instance,
			})
			// dialecte-allow argument-mutation: the walk's accumulator of accepted moves, as `added`
			params.moves.push({ instance: moved.instance, parent: parent as Scl.Ref<Scl.ElementsOf> })
		}
		// keep the clone mappings of the whole grafted subtree (ids are stable; the collision
		// bump below only edits the added root's name, never its id).
		added.push(...cloneMappings)
		// stamp/preserve keep the fresh clone uuid + repoint refs; keep/fork converges to the
		// source revision's uuids (no remap) — the shared finalization owns that split.
		if (identityMode) await finalizeClonedIdentity(tx, { cloneMappings, mode: identityMode })

		// validate the added element against its instance-parent context: apply any
		// user edit then auto-resolve a name collision among siblings (schema constraint)
		const addRoot = cloneMappings.find((mapping) => mapping.source.id === sourceChild.id)
		if (addRoot) {
			const parentRef = toRef(instanceParent) as unknown as Scl.Ref<Scl.ElementsOf>
			const outcome = bumpsCollisions
				? await resolvePlacementCollision(tx, {
						ref: addRoot.target,
						parentRef,
						overrides: overrides?.get(sourceChild.id),
					})
				: undefined
			// a key nothing can change is refused, but only as the reconcile leaves it (its removals written); a caller
			// numbering nothing (no scenario does today) has its additions checked the same way
			if (!outcome || outcome.status === 'unresolvable') {
				pendingCollisions.push({ ref: addRoot.target, parentRef })
			}
		}
	}

	// a name written that a sibling already holds is numbered, as a placed element's is — once every rename of the
	// parent is written, so two children trading names need no number (`numberRenames` says the same in the report).
	// A key a rename leaves colliding has no editable field: the project held it so before
	for (const renamed of bumpsCollisions ? renamedChildren : []) {
		await resolvePlacementCollision(tx, { ref: toRef(renamed) as Scl.Ref<Scl.ElementsOf> })
	}

	// Unmatched instance children with no lineage under the scenario's key:
	//  - a REFERENCE (link) tag = a dropped link → removed (fast track removes it; the
	//    full track gates on the removed node's acceptance);
	//  - an IED's data-flow reference (`classifyUnpairedReference`) and any other tag = an
	//    author-added TARGET-ONLY element → preserved by default and
	//    removed ONLY when its own decision group is explicitly accepted.
	// Identified removals (lineage gone) are handled by `deleteRemoved`.
	for (const instanceChild of instanceParent.tree) {
		if (matchedInstanceIds.has(instanceChild.id)) continue
		// a boundary tag is owned by another pass - never delete it here
		if (omit?.includes(instanceChild.tagName)) continue
		const lineage = await tx.any.getAttribute(instanceChild, { name: matchKey })
		if (lineage) continue
		if (
			DISPOSABLE_REFERENCE_TAGS.has(instanceChild.tagName) &&
			!KEEP_ON_ORPHAN_REFS.has(instanceChild.tagName) &&
			classifyUnpairedReference({ tagName: instanceChild.tagName }) === 'removed'
		) {
			// a shared element's other links are not this template's to drop: explicit accept only
			if (keepLeftoverRefs && !accepted) continue
			if (accepted && !accepted.instanceIds.has(instanceChild.id)) continue
		} else if (params.valueOwnership.lostData.has(instanceChild.id)) {
			// data the type the template gives its logical node no longer holds goes with the type change, unless skipped
			if (accepted && !accepted.instanceIds.has(instanceChild.id)) continue
		} else {
			// never remove an author addition implicitly — require an explicit accept
			if (!accepted || !accepted.instanceIds.has(instanceChild.id)) continue
		}

		const live = await tx.any.getRecord(instanceChild)
		if (live) {
			await tx.any.delete(instanceChild)
			removedTags.push(instanceChild.tagName)
		}
	}

	// a data set's entries in the template's order (the order the data is sent in), its control blocks raised when an
	// entry changed; a first
	// placement rewrites nothing the project holds, as the report lists no order change there
	if (params.contributeOnly) return
	await writeDataSetChange(tx, {
		sourceNode,
		instanceParent,
		pairs,
		added: params.added,
		removedTags,
		accepted,
		confRevBumps: params.confRevBumps,
		matchKey,
		redirectedSourceUuids: params.redirectedSourceUuids ?? new Map(),
		templateBlocks: params.templateBlocks,
	})
}

/** Record where an identified source element of a contribution landed, when the element it landed on is another. */
async function recordLanding(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		sourceChild: AnyTreeRecord
		match: ChildMatch
		landedOn: RedirectMapping[]
	},
): Promise<void> {
	const { sourceQuery, sourceChild, match, landedOn } = params
	const sourceUuid = await sourceQuery.any.getAttribute(sourceChild, { name: 'uuid' })
	if (!sourceUuid) return
	const landedUuid = await tx.any.getAttribute(match.record, { name: 'uuid' })
	if (landedUuid === sourceUuid) return
	landedOn.push({ sourceUuid, target: toRef(match.record) as Scl.Ref<Scl.ElementsOf> })
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
		/** The instance elements the key pass paired: held by the template whatever their lineage says. */
		pairedByKey: ReadonlySet<string>
		/** The instance elements the walk moved: out of what a removal takes, their own removals collected. */
		movedIds: ReadonlySet<string>
	},
): Promise<void> {
	const { instanceNode, sourceUuids, accepted, matchKey, removalBase, omit } = params
	const toDelete: AnyTreeRecord[] = []
	await collectRemoved(tx, {
		node: instanceNode,
		sourceUuids,
		pairedByKey: params.pairedByKey,
		accepted,
		matchKey,
		removalBase,
		omit,
		movedIds: params.movedIds,
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
		pairedByKey: ReadonlySet<string>
		accepted: AcceptedIds | undefined
		matchKey: MatchKey
		removalBase: RemovalBase
		omit: readonly string[] | undefined
		movedIds: ReadonlySet<string>
		out: AnyTreeRecord[]
	},
): Promise<void> {
	const { node, sourceUuids, accepted, matchKey, removalBase, omit, movedIds, out } = params
	// a boundary subtree is owned by another pass - do not delete or descend into it
	if (omit?.includes(node.tagName)) return
	const lineage = await tx.any.getAttribute(node, { name: matchKey })
	const unmatched = lineage
		? classifyUnmatched({
				tagName: node.tagName,
				lineage,
				inSource: sourceUuids.has(lineage) || params.pairedByKey.has(node.id),
				removalBase,
			})
		: 'still-held'
	// one atomic group, its subtree cascading with it (do not descend): a removal is written unless it was
	// skipped, an element of the project's own only when its removal was accepted
	// what the walk moved out of it left before the delete: its own removals are collected where it now is
	const below =
		unmatched === 'still-held'
			? node.tree
			: topmostBelow({ node, picks: (child) => movedIds.has(child.id) })
	if (unmatched !== 'still-held' && acceptsRemoval({ change: unmatched, id: node.id, accepted }))
		// dialecte-allow argument-mutation: the walk's accumulator of the removals to write, filled as it walks
		out.push(node)
	for (const child of below) {
		await collectRemoved(tx, { ...params, node: child })
	}
}

/**
 * Write the template's visible attributes on a matched element, and list it to follow the type the template names when
 * it changed. Returns whether its name was written.
 */
async function updateMatchedAttributes(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		instanceRecord: AnyTreeRecord
		sourceNode: AnyTreeRecord
		accepted?: AcceptedIds
		overrides?: CollisionOverrides
		namesFollow: NamesFollow
		retargetUuids?: ReadonlySet<string>
		typeFollowing: TypeFollowing
		valueOwnership: ValueOwnership
	},
): Promise<boolean> {
	const { sourceQuery, instanceRecord, sourceNode, accepted, overrides, namesFollow } = params
	const { retargetUuids } = params
	if (accepted && !accepted.sourceIds.has(sourceNode.id)) return false

	// The template's attributes, with the user's value edits overlaid (so an in-place
	// update honors an edited `desc`/`name` just like a freshly added element does).
	const sourceAttributes = await sourceQuery.any.getAttributes(sourceNode)
	const instanceAttributes = await tx.any.getAttributes(instanceRecord)
	const desired = {
		...visibleAttributes({
			record: sourceNode,
			attributes: sourceAttributes,
			counterpartAttributes: instanceAttributes,
			namesFollow,
			...(retargetUuids ? { retargets: { uuids: retargetUuids, sourceIs: 'attributes' } } : {}),
		}),
		...overrides?.get(sourceNode.id),
	}
	const current = visibleAttributes({
		record: instanceRecord,
		attributes: instanceAttributes,
		counterpartAttributes: sourceAttributes,
		namesFollow,
		...(retargetUuids ? { retargets: { uuids: retargetUuids, sourceIs: 'counterpart' } } : {}),
	})
	// what the project owns on the element (a bound LNode's implementation and type) is never
	// written, even when a user edit overlaid above lists it
	const owned = projectOwnedAttributes({
		tagName: instanceRecord.tagName,
		instanceAttributes,
		sourceAttributes,
		namesFollow,
		bindingFollows: retargetUuids !== undefined,
	})

	// Union of both sides: a name present on the template overwrites, a name the
	// template dropped (present on the instance, absent from `desired`) is cleared
	// (`undefined` removes it) — otherwise a reconcile would leave a stale instance value.
	const updates: Record<string, string | undefined> = {}
	for (const name of new Set([...Object.keys(desired), ...Object.keys(current)])) {
		// a template value equal to its schema default is folded out of `desired` to compare, but written as the
		// template holds it: a required attribute with a fixed value is never removed
		const next = name in desired ? desired[name] : sourceAttributes[name]
		if (owned.attributes.has(name)) continue
		if (current[name] !== next) updates[name] = next
	}

	// a text the template changed is written as an attribute is, in the same update — but a value the project may set
	// keeps the project's, unless taken over
	const { textChange } = compareText({
		sourceNode,
		instanceNode: instanceRecord,
		ownership: params.valueOwnership,
	})
	const changesAttributes = Object.keys(updates).length > 0
	if (changesAttributes || textChange) {
		// `update` removes an attribute on an `undefined` value; the AnyTransaction param is
		// typed string-only, so cast the dynamic map (matches the repo's `as Record` pattern).
		await tx.any.update(instanceRecord, {
			...(changesAttributes ? { attributes: updates as Record<string, string> } : {}),
			...(textChange ? { value: sourceNode.value } : {}),
		})
	}
	await listTypeFollower(tx, {
		sourceQuery,
		instanceRecord,
		sourceNode,
		accepted,
		typeFollowing: params.typeFollowing,
	})
	// the update went through the transaction: every path naming a renamed element follows
	return 'name' in updates
}

/**
 * List a matched element to follow the type its template element names, when the type differs and its change is the
 * update's to write: the report listed it in an accepted group (any change, called with no gate). A type the project
 * keeps (a bound LNode, on the consumer's word) is never listed there: the report reads that word, the gate follows it.
 */
async function listTypeFollower(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		instanceRecord: AnyTreeRecord
		sourceNode: AnyTreeRecord
		accepted: AcceptedIds | undefined
		typeFollowing: TypeFollowing
	},
): Promise<void> {
	const { sourceQuery, instanceRecord, sourceNode, accepted, typeFollowing } = params
	if (accepted && !accepted.typeChangeIds.has(sourceNode.id)) return
	const changes = await typeChangesOf(sourceQuery, {
		targetQuery: tx,
		sourceNode,
		instanceNode: instanceRecord,
		comparison: typeFollowing.comparison,
	})
	if (changes.length === 0) return
	typeFollowing.followers.push({
		source: sourceNode as unknown as LogicalNodeRecord,
		target: toRef(instanceRecord) as TypeFollower['target'],
	})
}

/** Write the template element's uuid as the lineage of the instance element paired with it by key. */
async function restampLineage(
	tx: Core.Transaction<Config>,
	params: { sourceChild: AnyTreeRecord; matched: AnyTreeRecord },
): Promise<void> {
	const sourceUuid = readAttribute({ record: params.sourceChild, name: 'uuid', defaults: 'none' })
	if (!sourceUuid) return
	await tx.any.update(params.matched, { attributes: { templateUuid: sourceUuid } })
}

/** Accepted ids without some instance ids; undefined (every change written) stays undefined. */
function withoutIds(params: {
	accepted: AcceptedIds | undefined
	ids: ReadonlySet<string>
}): AcceptedIds | undefined {
	const { accepted, ids } = params
	if (!accepted || ids.size === 0) return accepted
	return {
		...accepted,
		instanceIds: new Set([...accepted.instanceIds].filter((id) => !ids.has(id))),
	}
}
