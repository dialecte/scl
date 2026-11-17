import { ORDERED_CHILD_TAGS } from './data-set-order.constants'

import { readConfRevBumps } from '@/v2019C1/extensions/lifecycle/layers/ied/bump-data-set-conf-revs'

import type { ConfRevBumpQueue, DataSetChange } from './data-set-order.types'
import type { AcceptedIds } from './decide.types'
import type { ConfRevBump, DiffNode } from './diff.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TemplateBlocks } from '@/v2019C1/extensions/lifecycle/layers/ied/bump-data-set-conf-revs.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

type Reader = Core.Query<Config> | Core.Transaction<Config>

/**
 * What changes in a matched data set's entries for the report: its order change (`DiffNode.orderChange`) — its entries
 * as the update leaves them (the paired ones where the instance holds them, the template's new ones after them) against
 * the template's order — and, when an entry is added, removed or put in another order, the configuration revisions
 * that raises (`DiffNode.confRevBumps`). Empty for a tag whose children are no data set entries, or no such change.
 */
export async function readDataSetChange(
	targetQuery: Reader,
	params: {
		sourceNode: AnyTreeRecord
		instanceNode: AnyTreeRecord
		children: readonly DiffNode[]
		matchKey: MatchKey
		redirectedSourceUuids: ReadonlyMap<string, string>
		/** The template's control blocks by uuid: see `readTemplateBlocks`. */
		templateBlocks: TemplateBlocks
	},
): Promise<DataSetChange> {
	const { sourceNode, instanceNode, children } = params
	const tagName = ORDERED_CHILD_TAGS.get(sourceNode.tagName)
	if (!tagName) return {}
	const entries = children.filter((node) => node.tagName === tagName)
	const placed = new Map(
		entries.flatMap((node): [string, string][] => {
			const sourceId = node.sourceRef?.id
			if (!sourceId) return []
			const instanceId = node.instanceRef?.id
			if (instanceId) return [[sourceId, instanceId]]
			return node.change === 'added' ? [[sourceId, `+${sourceId}`]] : []
		}),
	)
	const templateIds = idsInTemplateOrder({ sourceNode, tagName, placed })
	const currentIds = [
		...instanceNode.tree.filter((child) => child.tagName === tagName).map((child) => child.id),
		...templateIds.filter((templateId) => templateId.startsWith('+')),
	]
	const reordered = isReordered({ templateIds, currentIds })
	const entriesChange = entries.some((node) => node.change === 'added' || node.change === 'removed')
	if (!reordered && !entriesChange) return {}
	const { bumps, notRaised } = await readConfRevBumps(targetQuery, {
		instanceDataSet: instanceNode,
		templateBlocks: params.templateBlocks,
		matchKey: params.matchKey,
		redirectedSourceUuids: params.redirectedSourceUuids,
	})
	return {
		...(reordered ? { orderChange: { tagName } } : {}),
		...(bumps.length > 0 ? { confRevBumps: bumps } : {}),
		...(notRaised.length > 0 ? { confRevNotRaised: notRaised } : {}),
	}
}

/**
 * Write what changes in a data set's entries once the walk of the data set is done: the template's order when the
 * update left them in another, its decision accepted — the template's entries in its order, each entry of the
 * project's own right after the one it followed (first when it followed none), written again in that order (nothing
 * names an entry, so they may take new records); and, when an entry was added, removed or put in another order, the
 * configuration revision of each control block naming the data set, raised once the walk is done (`confRevBumps`).
 */
export async function writeDataSetChange(
	tx: Core.Transaction<Config>,
	params: {
		sourceNode: AnyTreeRecord
		instanceParent: AnyTreeRecord
		/** Each source entry the walk paired, with the instance entry it paired with. */
		pairs: ReadonlyMap<string, string>
		added: readonly Scl.CloneMapping[]
		/** The tags of the children of the data set the walk removed. */
		removedTags: readonly string[]
		accepted: AcceptedIds | undefined
		confRevBumps: ConfRevBumpQueue
		matchKey: MatchKey
		redirectedSourceUuids: ReadonlyMap<string, string>
		/** The template's control blocks by uuid: see `readTemplateBlocks`. */
		templateBlocks: TemplateBlocks
	},
): Promise<void> {
	const { sourceNode, instanceParent, accepted } = params
	const tagName = ORDERED_CHILD_TAGS.get(sourceNode.tagName)
	if (!tagName) return
	const sourceEntryIds = new Set(
		sourceNode.tree.filter((child) => child.tagName === tagName).map((child) => child.id),
	)
	const addedHere = params.added.flatMap((mapping): [string, string][] =>
		mapping.source.id && mapping.target.id && sourceEntryIds.has(mapping.source.id)
			? [[mapping.source.id, mapping.target.id]]
			: [],
	)
	const moved = await writeTemplateOrder(tx, {
		sourceNode,
		instanceParent,
		tagName,
		placed: new Map([...params.pairs, ...addedHere]),
		accepted,
	})
	const reordered = moved !== undefined
	if (moved) params.confRevBumps.moved(moved)
	const removedHere = params.removedTags.includes(tagName)
	if (!reordered && addedHere.length === 0 && !removedHere) return
	// a block whose own change the template raises takes the template's value, unless that change is skipped
	const { bumps } = await readConfRevBumps(tx, {
		instanceDataSet: instanceParent,
		templateBlocks: params.templateBlocks,
		matchKey: params.matchKey,
		redirectedSourceUuids: params.redirectedSourceUuids,
		accepted,
		writesAll: accepted === undefined,
	})
	params.confRevBumps.defer(bumps)
}

/**
 * Write the template's order of a data set's entries, its decision accepted: each record replaced with the id of its
 * copy, undefined when nothing was written.
 */
async function writeTemplateOrder(
	tx: Core.Transaction<Config>,
	params: {
		sourceNode: AnyTreeRecord
		instanceParent: AnyTreeRecord
		tagName: string
		placed: ReadonlyMap<string, string>
		accepted: AcceptedIds | undefined
	},
): Promise<ReadonlyMap<string, string> | undefined> {
	const { sourceNode, instanceParent, tagName, accepted } = params
	// a matched data set's change is accepted by its template counterpart (`acceptedRefIds` keys a change by source)
	if (accepted && !accepted.sourceIds.has(sourceNode.id)) return undefined
	const templateIds = idsInTemplateOrder({ sourceNode, tagName, placed: params.placed })
	const live = await tx.any.getRecord(instanceParent)
	const currentIds = (live?.children ?? [])
		.filter((child) => child.tagName === tagName)
		.map((child) => child.id)
	if (!isReordered({ templateIds, currentIds })) return undefined
	return rewriteInOrder(tx, {
		parent: instanceParent,
		tagName,
		ids: placeOwnEntries({ templateIds, currentIds }),
	})
}

/** A queue of the configuration revisions an apply raises, written once its walk is done: see `ConfRevBumpQueue`. */
export function createConfRevBumpQueue(): ConfRevBumpQueue {
	const queued: ConfRevBump[] = []
	const replaced = new Map<string, string>()
	return {
		defer: function deferBumps(bumps) {
			queued.push(...bumps)
		},
		list: function listBumps() {
			return queued
		},
		moved: function recordMoves(ids) {
			for (const [before, after] of ids) replaced.set(before, after)
		},
		movedIds: function listMoves() {
			return replaced
		},
	}
}

/**
 * The copies an apply reports, each naming the record that holds it now: a data set written again in order gave its
 * entries new records (`ConfRevBumpQueue.movedIds`).
 */
export function remapCopies(params: {
	mappings: readonly Scl.CloneMapping[]
	movedIds: ReadonlyMap<string, string>
}): Scl.CloneMapping[] {
	const { movedIds } = params
	return params.mappings.map((mapping) => {
		const movedTo = mapping.target.id ? movedIds.get(mapping.target.id) : undefined
		return movedTo ? { ...mapping, target: { ...mapping.target, id: movedTo } } : mapping
	})
}

/** The instance ids (`+<source id>` for one not written yet) of the template's entries, in its order. */
function idsInTemplateOrder(params: {
	sourceNode: AnyTreeRecord
	tagName: string
	placed: ReadonlyMap<string, string>
}): string[] {
	return params.sourceNode.tree
		.filter((child) => child.tagName === params.tagName)
		.flatMap((child) => {
			const placed = params.placed.get(child.id)
			return placed ? [placed] : []
		})
}

/** Whether the template's entries stand in another order than the template's, the project's own aside. */
function isReordered(params: {
	templateIds: readonly string[]
	currentIds: readonly string[]
}): boolean {
	const template = new Set(params.templateIds)
	const current = params.currentIds.filter((entryId) => template.has(entryId))
	return current.some((entryId, position) => entryId !== params.templateIds[position])
}

/** The template's entries in its order, each of the project's own right after the entry it followed in `currentIds`. */
function placeOwnEntries(params: {
	templateIds: readonly string[]
	currentIds: readonly string[]
}): string[] {
	const template = new Set(params.templateIds)
	const placed = [...params.templateIds]
	let leading = 0
	params.currentIds.forEach((entryId, position) => {
		if (template.has(entryId)) return
		const previous = params.currentIds[position - 1]
		if (previous === undefined) {
			placed.splice(leading, 0, entryId)
			leading += 1
			return
		}
		placed.splice(placed.indexOf(previous) + 1, 0, entryId)
	})
	return placed
}

/** Write a parent's entries of a tag again in `ids` order: each copied after the last, then the earlier ones removed. */
async function rewriteInOrder(
	tx: Core.Transaction<Config>,
	params: { parent: AnyTreeRecord; tagName: string; ids: readonly string[] },
): Promise<ReadonlyMap<string, string>> {
	const parentRef = { tagName: params.parent.tagName, id: params.parent.id }
	// the parent's entries as they stand, read at once
	const parent = await tx.any.getTree(parentRef)
	const entries = new Map(
		(parent?.tree ?? []).map((entry): [string, AnyTreeRecord] => [entry.id, entry]),
	)
	const copies: [string, string][] = []
	for (const entryId of params.ids) {
		const entry = entries.get(entryId)
		if (!entry) continue
		const { mappings } = await tx.any.deepClone(parentRef, entry)
		copies.push(
			...mappings.flatMap((mapping): [string, string][] =>
				mapping.source.id && mapping.target.id ? [[mapping.source.id, mapping.target.id]] : [],
			),
		)
	}
	for (const entryId of params.ids) {
		await tx.any.delete({ tagName: params.tagName, id: entryId })
	}
	return new Map(copies)
}
