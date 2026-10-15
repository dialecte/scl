import {
	IMPLEMENTATION_PAIRS_BY_REF,
	IMPLEMENTATION_TARGET_TAGS,
} from './orphan-lnode-bindings.constants'

import { UNALLOCATED_IED_NAME } from '@/v2019C1/constants'
import { isLNodeLocked } from '@/v2019C1/extensions/data-model/query'
import { releaseLNodeBinding } from '@/v2019C1/extensions/data-model/transaction/release-lnode-binding'
import { resolveMappedLNode } from '@/v2019C1/extensions/reference/query/resolve'
import { LN_TARGETS } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-lnode.constants'

import type { ResetLNodesParams } from './orphan-lnode-bindings.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { ReferencePair } from '@/v2019C1/extensions/reference/constants'
import type * as Core from '@dialecte/core'

/**
 * Releases the LNodes bound to a logical node the document does not hold: an LNode names the LN
 * that implements it, and that LN must be in the document.
 *
 * - not bound (`iedName` `None`, empty or absent) → the explicit `iedName="None"` marker is written
 *   (the store is faithful: an omitted `iedName` is not stamped on import);
 * - bound, its LN in the document → left as it is. With an `lnUuid`, only the LN of that uuid
 *   counts, whatever its naming says; without one, the LN its naming names;
 * - bound, its LN absent → assigned to no IED, its prefix, class and instance back from its
 *   `LNodeSpecNaming`, which is never rewritten. Nothing of a device is removed: unlike
 *   `dataModel.unlockLNode`, the data a device instantiates stays where it is.
 *
 * The other names of an LNode's implementation follow the same rule, whether it is bound or not (an
 * LNode implemented by several logical nodes, or sharing one, stays assigned to no IED and names
 * them in its data and signals): the logical node its `DOS` / `SDS` / `DAS` data is mapped to, the
 * ExtRef / ExtCtrl its `SourceRef` / `ControlRef` name. One naming nothing in the document is
 * removed; the element stays.
 *
 * `templateUuid` is kept in every case: it records the template the LNode was instantiated from,
 * whatever implements it.
 */
export async function resetLNodes(
	tx: Core.Transaction<Config>,
	params: ResetLNodesParams = {},
): Promise<void> {
	const lnodes = await readLNodes(tx, params)
	const uuidsByTag = await collectTargetUuids(tx)

	for (const lnode of lnodes) {
		if (!(await isLNodeLocked(tx, lnode))) {
			// not bound: stamp the explicit 'None' marker (no-op if already stored)
			await tx.update(lnode, { attributes: { iedName: UNALLOCATED_IED_NAME } })
			continue
		}
		const bound = await bindingResolves(tx, { lnode, uuidsByTag })
		if (!bound) await releaseLNodeBinding(tx, { lnode })
	}

	// read once the LNodes are released: what a release rewrote is read as it now stands
	const referrers = await readReferrers(tx, params)
	for (const referrer of referrers) {
		const pairs = IMPLEMENTATION_PAIRS_BY_REF.get(referrer.tagName) ?? []
		await removeUnresolvedNames(tx, { referrer, pairs, uuidsByTag })
	}
}

// ── Local helpers ───────────────────────────────────────────────────────────

/** The LNodes among the elements given, else every LNode of the document. */
async function readLNodes(
	tx: Core.Transaction<Config>,
	params: ResetLNodesParams,
): Promise<Scl.TrackedRecord<'LNode'>[]> {
	if (!params.elements) return tx.getRecordsByTagName('LNode')
	const lnodes = params.elements.filter((element) => element.tagName === 'LNode')
	const records = await tx.getRecords(lnodes as Scl.Ref<'LNode'>[])
	return records.filter((record) => record !== undefined)
}

/** The data and signals among the elements given, else those of the whole document. */
async function readReferrers(
	tx: Core.Transaction<Config>,
	params: ResetLNodesParams,
): Promise<Scl.TrackedRecord<Scl.ElementsOf>[]> {
	if (!params.elements) {
		const referrers: Scl.TrackedRecord<Scl.ElementsOf>[] = []
		for (const tagName of IMPLEMENTATION_PAIRS_BY_REF.keys()) {
			const records = await tx.getRecordsByTagName(tagName as Scl.ElementsOf)
			referrers.push(...records)
		}
		return referrers
	}
	const given = params.elements.filter((element) =>
		IMPLEMENTATION_PAIRS_BY_REF.has(element.tagName),
	)
	const records = await tx.getRecords([...given])
	return records.filter((record) => record !== undefined)
}

/** The uuids of every element an implementation can name, per tag, read once. */
async function collectTargetUuids(tx: Core.Transaction<Config>): Promise<Map<string, Set<string>>> {
	const uuidsByTag = new Map<string, Set<string>>()
	for (const tagName of IMPLEMENTATION_TARGET_TAGS) {
		const uuids = new Set<string>()
		const records = await tx.getRecordsByTagName(tagName as Scl.ElementsOf)
		for (const record of records) {
			const uuid = await tx.getAttribute(record, { name: 'uuid' })
			if (uuid) uuids.add(uuid)
		}
		uuidsByTag.set(tagName, uuids)
	}
	return uuidsByTag
}

/** Whether one of `tagNames` in the document carries `uuid`. */
function isInDocument(params: {
	uuid: string
	tagNames: readonly string[]
	uuidsByTag: ReadonlyMap<string, ReadonlySet<string>>
}): boolean {
	const { uuid, tagNames, uuidsByTag } = params
	return tagNames.some((tagName) => uuidsByTag.get(tagName)?.has(uuid))
}

/** Whether the LN an LNode is bound to is in the document: by its `lnUuid`, else by its naming. */
async function bindingResolves(
	tx: Core.Transaction<Config>,
	params: {
		lnode: Scl.TrackedRecord<'LNode'>
		uuidsByTag: ReadonlyMap<string, ReadonlySet<string>>
	},
): Promise<boolean> {
	const { lnode, uuidsByTag } = params
	const lnUuid = await tx.getAttribute(lnode, { name: 'lnUuid' })
	if (lnUuid) return isInDocument({ uuid: lnUuid, tagNames: [...LN_TARGETS], uuidsByTag })
	const ln = await resolveMappedLNode(tx, lnode)
	return ln !== undefined
}

/** Remove the names of a referrer's references whose uuid points at nothing in the document. */
async function removeUnresolvedNames(
	tx: Core.Transaction<Config>,
	params: {
		referrer: Scl.TrackedRecord<Scl.ElementsOf>
		pairs: readonly ReferencePair[]
		uuidsByTag: ReadonlyMap<string, ReadonlySet<string>>
	},
): Promise<void> {
	const { referrer, pairs, uuidsByTag } = params
	const removed: Record<string, string | undefined> = {}
	for (const pair of pairs) {
		const uuid = await tx.any.getAttribute(referrer, { name: pair.attribute.uuid })
		if (!uuid || isInDocument({ uuid, tagNames: pair.target, uuidsByTag })) continue
		removed[pair.attribute.uuid] = undefined
		removed[pair.attribute.path] = undefined
		for (const companion of pair.companions) removed[companion.name] = undefined
	}
	if (Object.keys(removed).length === 0) return
	// `update` removes an attribute given `undefined`; the untyped surface takes string values only
	await tx.any.update(referrer, { attributes: removed as Record<string, string> })
}
