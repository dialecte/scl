import { DATA_REFERRER_TAGS, LOGICAL_NODE_TAGS } from './deleted-data-referrers.constants'
import { movedOut, removedElementsOf, topmostBelow } from './moved'
import { classifyUnmatched } from './removal-base'
import { typeChangesOf } from './type-change'
import { readValueTypes } from './value-ownership'
import { FUNCTIONAL_CONSTRAINT_ATTRIBUTE } from './value-ownership.constants'

import { toRawRecord, toRef } from '@dialecte/core/helpers'

import { CONF_REV_CONTROL_TAGS } from '@/v2019C1/extensions/lifecycle/layers/ied/bump-data-set-conf-revs.constants'
import { readAttribute } from '@/v2019C1/helpers'
import { confRevRaisesOf } from '@/v2019C1/hooks/shared/data-set-entry'
import { inputSourceEffect } from '@/v2019C1/hooks/shared/input-source'

import type { AcceptedIds } from './decide.types'
import type {
	DeletedDataReferrer,
	DeletedTargets,
	DocumentReader,
} from './deleted-data-referrers.types'
import type { ConfRevBump, DiffReads } from './diff.types'
import type { RemovalBase } from './removal-base.types'
import type { TypeComparison } from './type-change.types'
import type { ValueTypes } from './value-ownership.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { InputSourceEffect } from '@/v2019C1/hooks/shared/input-source.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord, AnyRef, AnyTreeRecord } from '@dialecte/core'

/**
 * The references of the project naming data an update of an instance deletes: each `FCDA` and `ExtRef` outside what the
 * update removes that names, by its uuid,
 * - a logical node the update removes (with the device holding it, or alone): its entry goes, its input is unbound;
 * - a control block the update removes: the input keeps its data, the control block it names is cleared;
 * - a logical node whose type the update changes, at a data object or attribute the template's type no longer holds:
 *   its entry goes, its input is unbound.
 * The report's diff and the apply's reconcile both read it, so the report lists what the apply writes. The template's
 * types are read once, and the references once per tag, only when the update deletes anything.
 */
export async function findDeletedDataReferrers(
	query: DocumentReader,
	params: {
		sourceQuery: Core.Query<Config>
		sourceTree: AnyTreeRecord
		instanceTree: AnyTreeRecord
		sourceUuids: ReadonlySet<string>
		/** The lineages the walk can pair: what carries one below a removed element moves out of it. */
		movable: ReadonlySet<string>
		matchKey: MatchKey
		removalBase: RemovalBase
		typeComparison: TypeComparison
		/** Shared by the diffs of one update; none for an apply, which writes between instances. */
		reads?: DiffReads
	},
): Promise<DeletedDataReferrer[]> {
	const targets = await readDeletedTargets(query, params)
	if (targets.removed.size === 0 && targets.retyped.size === 0) return []
	const types = targets.retyped.size > 0 ? await readValueTypes(params.sourceQuery) : undefined
	const entries = await readReferrerTag(query, {
		tagName: DATA_REFERRER_TAGS.entry,
		reads: params.reads,
	})
	const inputs = await readReferrerTag(query, {
		tagName: DATA_REFERRER_TAGS.input,
		reads: params.reads,
	})
	return [...entries, ...inputs].flatMap((record) => {
		if (targets.removedIds.has(record.id)) return []
		const naming = deletedDataNamedBy({ record: record as AnyRawRecord, targets, types })
		if (!naming) return []
		const effect: InputSourceEffect =
			record.tagName === DATA_REFERRER_TAGS.input
				? inputSourceEffect({ record: record as AnyRawRecord, scope: naming.scope })
				: { effect: 'deleted' }
		return [{ referrer: record as AnyRawRecord, effect, ...naming }]
	})
}

/** The references of a tag, read once per update when its diffs share their reads. */
async function readReferrerTag(
	query: DocumentReader,
	params: { tagName: string; reads: DiffReads | undefined },
): Promise<readonly AnyRawRecord[]> {
	const { tagName, reads } = params
	const known = reads?.referrersByTag.get(tagName)
	if (known) return known
	const found = await query.getRecordsByTagName(tagName as Scl.ElementsOf)
	const records = found.map((record) => toRawRecord(record) as AnyRawRecord)
	// dialecte-allow argument-mutation: the reads the diffs of one update share, filled as they read
	reads?.referrersByTag.set(tagName, records)
	return records
}

/** What an update deletes in an instance: the elements it removes, and the logical nodes whose type it changes. */
async function readDeletedTargets(
	query: DocumentReader,
	params: {
		sourceQuery: Core.Query<Config>
		sourceTree: AnyTreeRecord
		instanceTree: AnyTreeRecord
		sourceUuids: ReadonlySet<string>
		movable: ReadonlySet<string>
		matchKey: MatchKey
		removalBase: RemovalBase
		typeComparison: TypeComparison
	},
): Promise<DeletedTargets> {
	const sourceByUuid = new Map(
		flatten(params.sourceTree).flatMap((node): [string, AnyTreeRecord][] => {
			const uuid = readAttribute({ record: node, name: 'uuid', defaults: 'none' })
			return uuid ? [[uuid, node]] : []
		}),
	)
	const { removedRoots, kept } = splitRemoved({ node: params.instanceTree, params })
	// what moved out of a removed element is the source's still, written elsewhere: its data is not deleted
	const removedNodes = removedRoots.flatMap((node) =>
		removedElementsOf({ node, matchKey: params.matchKey, movable: params.movable }),
	)
	const removed = new Map(
		removedNodes.flatMap((node): [string, string][] => {
			if (!LOGICAL_NODE_TAGS.has(node.tagName) && !CONF_REV_CONTROL_TAGS.has(node.tagName))
				return []
			const uuid = readAttribute({ record: node, name: 'uuid', defaults: 'none' })
			return uuid ? [[uuid, node.id]] : []
		}),
	)
	const retyped = new Map<string, { deletedBy: string; templateType: string }>()
	for (const node of kept.filter((candidate) => LOGICAL_NODE_TAGS.has(candidate.tagName))) {
		const entry = await retypedEntry(query, { node, sourceByUuid, params })
		if (entry) retyped.set(entry[0], entry[1])
	}
	return { removed, retyped, removedIds: new Set(removedNodes.map((node) => node.id)) }
}

/** A matched logical node whose type the template changes, by its uuid, with the template's type; none otherwise. */
async function retypedEntry(
	query: DocumentReader,
	params: {
		node: AnyTreeRecord
		sourceByUuid: ReadonlyMap<string, AnyTreeRecord>
		params: { sourceQuery: Core.Query<Config>; matchKey: MatchKey; typeComparison: TypeComparison }
	},
): Promise<[string, { deletedBy: string; templateType: string }] | undefined> {
	const { node, sourceByUuid } = params
	const { sourceQuery, matchKey, typeComparison } = params.params
	const lineage = readAttribute({ record: node, name: matchKey, defaults: 'none' })
	const sourceNode = lineage ? sourceByUuid.get(lineage) : undefined
	const uuid = readAttribute({ record: node, name: 'uuid', defaults: 'none' })
	if (!sourceNode || !uuid) return undefined
	const changes = await typeChangesOf(sourceQuery, {
		targetQuery: query as Core.Query<Config>,
		sourceNode,
		instanceNode: node,
		comparison: typeComparison,
	})
	const templateType = readAttribute({ record: sourceNode, name: 'lnType', defaults: 'none' })
	if (changes.length === 0 || !templateType) return undefined
	return [uuid, { deletedBy: node.id, templateType }]
}

/**
 * Split an instance into the subtrees the update removes (an element whose lineage the template no longer holds, with
 * all it holds) and the elements it keeps.
 */
function splitRemoved(params: {
	node: AnyTreeRecord
	params: {
		sourceUuids: ReadonlySet<string>
		movable: ReadonlySet<string>
		matchKey: MatchKey
		removalBase: RemovalBase
	}
}): { removedRoots: AnyTreeRecord[]; kept: AnyTreeRecord[] } {
	const { node } = params
	const { sourceUuids, movable, matchKey, removalBase } = params.params
	const lineage = readAttribute({ record: node, name: matchKey, defaults: 'none' })
	const removed =
		lineage !== '' &&
		classifyUnmatched({
			tagName: node.tagName,
			lineage,
			inSource: sourceUuids.has(lineage),
			removalBase,
		}) === 'removed'
	if (removed) {
		// what moves out of the removed element is judged on its own: kept, retyped, or holding removals of its own
		const movedOutOf = topmostBelow({
			node,
			picks: (child) => movedOut({ node: child, matchKey, movable }),
		}).map((child) => splitRemoved({ node: child, params: params.params }))
		return {
			removedRoots: [node, ...movedOutOf.flatMap((part) => part.removedRoots)],
			kept: movedOutOf.flatMap((part) => part.kept),
		}
	}
	const below = node.tree.map((child) => splitRemoved({ node: child, params: params.params }))
	return {
		removedRoots: below.flatMap((part) => part.removedRoots),
		kept: [node, ...below.flatMap((part) => part.kept)],
	}
}

/** What deleted data a reference names, and what of it goes: its whole source (`data`) or its control block only. */
function deletedDataNamedBy(params: {
	record: AnyRawRecord
	targets: DeletedTargets
	types: ValueTypes | undefined
}): Pick<DeletedDataReferrer, 'scope' | 'deletedBy'> | undefined {
	const { record, targets, types } = params
	const lnUuid = readAttribute({ record, name: 'lnUuid', defaults: 'none' })
	const removedBy = lnUuid ? targets.removed.get(lnUuid) : undefined
	if (removedBy) return { scope: 'data', deletedBy: removedBy }
	const retyped = lnUuid ? targets.retyped.get(lnUuid) : undefined
	if (retyped && types && !dataResolves({ record, types, lnType: retyped.templateType }))
		return { scope: 'data', deletedBy: retyped.deletedBy }
	if (record.tagName !== DATA_REFERRER_TAGS.input) return undefined
	const srcCBUuid = readAttribute({ record, name: 'srcCBUuid', defaults: 'none' })
	const blockRemovedBy = srcCBUuid ? targets.removed.get(srcCBUuid) : undefined
	return blockRemovedBy ? { scope: 'control-block', deletedBy: blockRemovedBy } : undefined
}

/**
 * Whether the data a reference names (`doName`, a data object then its sub data objects; `daName`, a data attribute
 * then its nested ones) is held by a logical node type, under the functional constraint an entry names it by (`fc`): a
 * data attribute of another one, or a data object holding none of it, is not that data. A reference naming no data
 * object names the logical node.
 */
function dataResolves(params: {
	record: AnyRawRecord
	types: ValueTypes
	lnType: string
}): boolean {
	const { record, types, lnType } = params
	const doName = readAttribute({ record, name: 'doName', defaults: 'none' })
	const daName = readAttribute({ record, name: 'daName', defaults: 'none' })
	const fc = readAttribute({ record, name: FUNCTIONAL_CONSTRAINT_ATTRIBUTE, defaults: 'none' })
	if (!doName) return true
	const objectType = walkMembers({
		types,
		typeId: lnType,
		names: doName.split('.'),
		continuesObject: true,
	})
	if (objectType === undefined) return false
	if (!daName) return !fc || holdsConstraint({ types, typeId: objectType, fc })
	const [attributeName, ...nested] = daName.split('.')
	const attribute = types.membersById.get(objectType)?.get(attributeName)
	if (!attribute || attribute.continuesObject) return false
	if (fc && attribute.fc !== fc) return false
	return (
		nested.length === 0 ||
		(attribute.type !== undefined &&
			walkMembers({ types, typeId: attribute.type, names: nested, continuesObject: false }) !==
				undefined)
	)
}

/** Whether a data object type holds a data attribute of a functional constraint, itself or in a sub data object. */
function holdsConstraint(params: { types: ValueTypes; typeId: string; fc: string }): boolean {
	const { types, typeId, fc } = params
	return [...(types.membersById.get(typeId)?.values() ?? [])].some((member) =>
		member.continuesObject
			? member.type !== undefined && holdsConstraint({ types, typeId: member.type, fc })
			: member.fc === fc,
	)
}

/**
 * Walk the members a dotted name gives down the types: the type the last one names (`''` for a leaf), or undefined when
 * a name is not a member of the kind asked of the type reached.
 */
function walkMembers(params: {
	types: ValueTypes
	typeId: string
	names: readonly string[]
	continuesObject: boolean
}): string | undefined {
	const { types, names, continuesObject } = params
	const [name, ...rest] = names
	if (name === undefined) return params.typeId
	const member = types.membersById.get(params.typeId)?.get(name)
	if (!member || member.continuesObject !== continuesObject) return undefined
	if (rest.length === 0) return member.type ?? ''
	if (!member.type) return undefined
	return walkMembers({ types, typeId: member.type, names: rest, continuesObject })
}

/** A tree and everything it holds, the node first. */
function flatten(node: AnyTreeRecord): AnyTreeRecord[] {
	return [node, ...node.tree.flatMap(flatten)]
}

/**
 * Write what the decisions accept of the references to deleted data (see {@link inputSourceEffect}, the delete
 * cascade's rule): an entry removed, an input's source cleared, whole or its control block only, or the input removed
 * when it holds no internal address. With no decisions (`accepted` undefined: every change written), each is written.
 * Returns the inputs cleared, and one raise of each control block sending a data set an entry left (read before any
 * write: queued with the walk's raises, a block rises once).
 */
export async function writeDeletedDataReferrers(
	tx: Core.Transaction<Config>,
	params: { referrers: readonly DeletedDataReferrer[]; accepted: AcceptedIds | undefined },
): Promise<{ cleared: ReadonlySet<string>; confRevBumps: ConfRevBump[] }> {
	const { referrers, accepted } = params
	const written = referrers.filter(
		({ referrer }) => !accepted || accepted.instanceIds.has(referrer.id),
	)
	const confRevBumps = await readEntryRaises(tx, {
		entries: written.flatMap(({ referrer }) =>
			referrer.tagName === DATA_REFERRER_TAGS.entry ? [referrer] : [],
		),
	})
	const cleared = new Set<string>()
	for (const { referrer, effect } of written) {
		if (effect.effect === 'deleted') {
			await tx.any.delete(toRef(referrer))
			continue
		}
		const attributes = Object.fromEntries(effect.attributes.map((name) => [name, undefined]))
		// `update` removes an attribute given `undefined`; the untyped surface takes string values only
		await tx.any.update(toRef(referrer), {
			attributes: attributes as unknown as Record<string, string>,
		})
		cleared.add(referrer.id)
	}
	return { cleared, confRevBumps }
}

/**
 * One raise of each control block of a data set's logical node sending a data set the entries leave
 * ({@link confRevRaisesOf}), the data sets, their logical nodes and those nodes' control blocks read a level at a time.
 */
async function readEntryRaises(
	tx: Core.Transaction<Config>,
	params: { entries: readonly AnyRawRecord[] },
): Promise<ConfRevBump[]> {
	const dataSets = await readRecords(tx, { refs: params.entries.flatMap(parentRef) })
	const nodes = await readRecords(tx, { refs: dataSets.flatMap(parentRef) })
	const blocks = await readRecords(tx, {
		refs: nodes.flatMap((node) =>
			node.children.filter((child) => CONF_REV_CONTROL_TAGS.has(child.tagName)),
		),
	})
	return dataSets.flatMap((dataSet) =>
		confRevRaisesOf({
			dataSetName: readAttribute({ record: dataSet, name: 'name', defaults: 'none' }),
			blocks: blocks.filter((block) => block.parent?.id === dataSet.parent?.id),
		}).map(({ block, confRev }) => ({
			controlBlock: toRef(block),
			before: readAttribute({ record: block, name: 'confRev', defaults: 'none' }),
			after: confRev,
		})),
	)
}

/** The parent of a record, as a ref; none for the root. */
function parentRef(record: AnyRawRecord): AnyRef[] {
	return record.parent ? [record.parent] : []
}

/** The records of some refs, each once, in one read. */
async function readRecords(
	tx: Core.Transaction<Config>,
	params: { refs: readonly AnyRef[] },
): Promise<AnyRawRecord[]> {
	const unique = [...new Map(params.refs.map((ref) => [ref.id, ref])).values()]
	if (unique.length === 0) return []
	const found = await tx.any.getRecords(unique)
	return found.flatMap((record) => (record ? [toRawRecord(record) as AnyRawRecord] : []))
}
