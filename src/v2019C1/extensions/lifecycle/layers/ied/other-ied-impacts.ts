import { CONF_REV_CONTROL_TAGS } from './bump-data-set-conf-revs.constants'
import {
	IMPACT_BY_CHANGE,
	LEAVING_CHANGES,
	RENAME_FOLLOWING_REFERRERS,
	SUBSCRIBED_INPUT_TAG,
} from './other-ied-impacts.constants'

import { throwDialecteError } from '@dialecte/core'
import { toRawRecord } from '@dialecte/core/helpers'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { isAccepted } from '@/v2019C1/extensions/lifecycle/engine/decide'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { getPathSegment } from '@/v2019C1/extensions/reference/query/build/path-segment'
import { TUPLE_TARGET_KINDS } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.constants'
import { readAttribute } from '@/v2019C1/helpers'
import { readAncestries } from '@/v2019C1/hooks/before-commit/tuple-names'

import type { Candidate, DataSetEntry, IedReader, OtherIedImpacts } from './other-ied-impacts.types'
import type { Config, Scl } from '@/v2019C1/config'
import type {
	DecisionGroup,
	DecisionMap,
	DiffNode,
	DiffReport,
	OtherIedImpact,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * What accepting the groups of an IED update's report would change in another IED: an update never changes one. Read
 * from what the report already lists, once the removal side effects are written:
 *  - a reference of another IED the update deletes or clears with what it removes (`sideEffects`, and the references
 *    waiting for a decision because they name data the update deletes);
 *  - an input of another IED subscribed, through a control block of the updated IED, to data a data set entry the
 *    update removes sends, or one the template no longer holds that the project keeps unless its removal is accepted
 *    (`unsubscribed`);
 *  - a reference of another IED naming by uuid an element the update renames, or one below it: the names it gives
 *    follow the rename (`renamed`).
 * Each is listed once, with the group bringing it (`impacts`); that group, the groups it waits for and those waiting
 * for it are the groups to block (`blockedGroupIds`). Reads: the updated IED's tree, the records listed, their
 * ancestries a level at a time, and the inputs and control blocks only when an entry goes.
 */
export async function readOtherIedImpacts(
	query: Core.Query<Config>,
	params: { report: DiffReport },
): Promise<OtherIedImpacts> {
	const none: OtherIedImpacts = { impacts: [], blockedGroupIds: new Set() }
	const instanceRef = params.report.instances[0]?.rootRef
	if (!instanceRef || instanceRef.tagName !== 'IED') return none
	const instanceTree = await query.any.getTree(instanceRef as Scl.Ref<'IED'>)
	if (!instanceTree) return none
	const inside = new Set(flatten(instanceTree).map((node) => node.id))
	const groups = allGroups(params.report)
	const candidates = [
		...referenceCandidates({ groups, inside }),
		...(await unsubscribedCandidates(query, { groups, inside })),
		...(await renamedCandidates(query, { groups, inside, instanceTree })),
	]
	if (candidates.length === 0) return none
	const found = await query.any.getRecords(candidates.map((candidate) => candidate.element))
	const iedOf = await owningIeds(query, {
		records: found.flatMap((record) => (record ? [toRawRecord(record) as AnyRawRecord] : [])),
	})
	const listed = new Map<string, OtherIedImpact>()
	for (const candidate of candidates) {
		const ied = iedOf.get(candidate.element.id)
		// an element is listed once per group bringing the change
		const key = `${candidate.element.id}|${candidate.groupId}`
		if (!ied || listed.has(key)) continue
		listed.set(key, { ied, ...candidate })
	}
	const impacts = [...listed.values()]
	const named = new Set(impacts.map((impact) => impact.groupId))
	return { impacts, blockedGroupIds: blockedGroupsOf({ groups, named }) }
}

/**
 * Refuse, before anything is written, decisions accepting a group the report blocks (`UPDATE_AFFECTS_OTHER_IED`,
 * `meta: { groups }`): accepted, it would change another IED.
 */
export function assertNoBlockedGroupAccepted(params: {
	groups: readonly DecisionGroup[]
	decisions: DecisionMap
}): void {
	const { decisions } = params
	const accepted = params.groups.filter(
		(group) => group.blocked && isAccepted({ group, decisions }),
	)
	if (accepted.length === 0) return
	throwDialecteError(SCL_ERRORS.UPDATE_AFFECTS_OTHER_IED, {
		meta: { groups: accepted.map((group) => group.id) },
		detail: `apply (ied): ${accepted.length} accepted group(s) would change another IED`,
	})
}

/**
 * Refuse a write an IED update staged from its `from`-th operation on that lands in another IED, with
 * `UPDATE_AFFECTS_OTHER_IED` (`meta: { ied, element }`, the first one): an update never changes one. What it creates inside the updated IED counts as inside; a record outside it is climbed to the IED
 * holding it, a level at a time. Elements outside every IED (types, communication, provenance) are not judged.
 */
export async function assertWritesInsideIed(
	tx: Core.Transaction<Config>,
	params: { instance: AnyTreeRecord; from: number },
): Promise<void> {
	const inside = new Set(flatten(params.instance).map((node) => node.id))
	const outside = new Map<string, AnyRawRecord>()
	for (const operation of tx.getStagedOperations().slice(params.from)) {
		const record = operation.status === 'deleted' ? operation.oldRecord : operation.newRecord
		if (inside.has(record.id)) continue
		if (operation.status === 'created' && record.parent && inside.has(record.parent.id)) {
			inside.add(record.id)
			continue
		}
		outside.set(record.id, record as AnyRawRecord)
	}
	if (outside.size === 0) return
	// a record the update deleted is no longer read: its ancestry climbs from the record the operation held
	const iedOf = await owningIeds(tx, { records: [...outside.values()] })
	const [changed] = [...iedOf.entries()]
	if (!changed) return
	const [elementId, ied] = changed
	const element = outside.get(elementId)
	throwDialecteError(SCL_ERRORS.UPDATE_AFFECTS_OTHER_IED, {
		meta: { ied, element: { tagName: element?.tagName ?? '', id: elementId } },
		detail: `update (ied): the update would write ${element?.tagName} in the IED ${ied}`,
	})
}

/** The references of other IEDs a group's removal deletes or clears, and those waiting for a decision on it. */
function referenceCandidates(params: {
	groups: readonly DecisionGroup[]
	inside: ReadonlySet<string>
}): Candidate[] {
	const { groups, inside } = params
	const causesOf = new Map<string, string[]>()
	for (const group of groups) {
		for (const dependency of group.dependsOn) {
			causesOf.set(dependency, [...(causesOf.get(dependency) ?? []), group.id])
		}
	}
	const fromSideEffects = groups.flatMap((group) =>
		(group.sideEffects ?? []).flatMap((sideEffect): Candidate[] =>
			inside.has(sideEffect.element.id)
				? []
				: [{ element: sideEffect.element, effect: sideEffect.effect, groupId: group.id }],
		),
	)
	const waiting = groups.flatMap((group): Candidate[] => {
		const { instanceRef } = group.primary
		if (group.requiresDecision !== 'names-deleted-data' || !instanceRef?.id) return []
		if (inside.has(instanceRef.id)) return []
		const effect = IMPACT_BY_CHANGE[group.change]
		if (!effect) return []
		const element = { tagName: instanceRef.tagName, id: instanceRef.id }
		// one listing per group deleting what it names: each is blocked
		return (causesOf.get(group.id) ?? [group.id]).map((groupId) => ({ element, effect, groupId }))
	})
	return [...fromSideEffects, ...waiting]
}

/**
 * The inputs outside the updated IED subscribed, through a control block of the data set an entry the update removes
 * belongs to, to the data that entry sends: the same logical node (by uuid), its data object or below, its attribute or
 * below when the entry names one.
 */
async function unsubscribedCandidates(
	query: Core.Query<Config>,
	params: { groups: readonly DecisionGroup[]; inside: ReadonlySet<string> },
): Promise<Candidate[]> {
	const removed = params.groups.flatMap((group) =>
		[group.primary, ...group.companions]
			.filter((node) => node.tagName === 'FCDA' && LEAVING_CHANGES.has(node.change))
			.flatMap((node) =>
				node.instanceRef?.id ? [{ id: node.instanceRef.id, groupId: group.id }] : [],
			),
	)
	if (removed.length === 0) return []
	const entries = await readDataSetEntries(query, { removed })
	if (entries.length === 0) return []
	const inputs = await query.getRecordsByTagName(SUBSCRIBED_INPUT_TAG)
	return inputs.flatMap((input): Candidate[] => {
		if (params.inside.has(input.id)) return []
		const entry = entries.find((candidate) => subscribes({ input, entry: candidate }))
		if (!entry) return []
		return [
			{
				element: { tagName: input.tagName, id: input.id },
				effect: 'unsubscribed',
				groupId: entry.groupId,
			},
		]
	})
}

/**
 * The references outside the updated IED naming by uuid an element whose name the update changes (its path segment
 * differs once the group's attribute changes are written: a device's instance, a logical node's prefix, class or
 * instance, an access point's or a control block's name), or an element below it: their names follow the rename. One
 * read per referrer tag, only when a group renames anything.
 */
async function renamedCandidates(
	query: Core.Query<Config>,
	params: {
		groups: readonly DecisionGroup[]
		inside: ReadonlySet<string>
		instanceTree: AnyTreeRecord
	},
): Promise<Candidate[]> {
	const nodesById = new Map(flatten(params.instanceTree).map((node) => [node.id, node]))
	const renamedBy = new Map<string, string>()
	for (const group of params.groups) {
		for (const node of [group.primary, ...group.companions]) {
			const record = node.instanceRef?.id ? nodesById.get(node.instanceRef.id) : undefined
			if (!record || node.change !== 'modified' || !renames({ record, node })) continue
			for (const below of flatten(record)) {
				const uuid = readAttribute({ record: below, name: 'uuid', defaults: 'none' })
				if (uuid && !renamedBy.has(uuid)) renamedBy.set(uuid, group.id)
			}
		}
	}
	if (renamedBy.size === 0) return []
	// every referrer tag read before the walk, only when something is renamed
	const following = [...RENAME_FOLLOWING_REFERRERS]
	const readByTag = await Promise.all(
		following.map(function readReferrers([tagName]) {
			// dialecte-allow query-in-loop: one read per referrer tag (about ten): core reads one tag per call
			return query.getRecordsByTagName(tagName as Scl.ElementsOf)
		}),
	)
	const candidates: Candidate[] = []
	for (const [position, [, pairs]] of following.entries()) {
		for (const referrer of readByTag[position] ?? []) {
			if (params.inside.has(referrer.id)) continue
			const groupId = pairs
				.map((uuidAttribute) =>
					readAttribute({ record: referrer, name: uuidAttribute, defaults: 'none' }),
				)
				.map((uuid) => (uuid ? renamedBy.get(uuid) : undefined))
				.find((found) => found !== undefined)
			if (groupId) {
				candidates.push({
					element: { tagName: referrer.tagName, id: referrer.id },
					effect: 'renamed',
					groupId,
				})
			}
		}
	}
	return candidates
}

/** Whether the attribute changes a node lists give its element another path segment: it is renamed. */
function renames(params: { record: AnyTreeRecord; node: DiffNode }): boolean {
	const { record, node } = params
	if (!TUPLE_TARGET_KINDS.has(record.tagName) || !node.attributeChanges?.length) return false
	const changed = new Map(node.attributeChanges.map((change) => [change.name, change.after]))
	const attributes = record.attributes.flatMap((attribute) => {
		if (!changed.has(attribute.name)) return [attribute]
		const value = changed.get(attribute.name)
		return value === undefined ? [] : [{ ...attribute, value }]
	})
	const added = [...changed].flatMap(([name, value]) =>
		value !== undefined && !record.attributes.some((attribute) => attribute.name === name)
			? [{ name, value }]
			: [],
	)
	const after = { ...record, attributes: [...attributes, ...added] } as AnyRawRecord
	return getPathSegment(record)?.segment !== getPathSegment(after)?.segment
}

/**
 * Each removed entry with what it sends and the uuids of the control blocks sending its data set: the entries, their
 * data sets, the logical nodes holding them and their control blocks read a level at a time.
 */
async function readDataSetEntries(
	query: Core.Query<Config>,
	params: { removed: readonly { id: string; groupId: string }[] },
): Promise<DataSetEntry[]> {
	const records = await readLevel(query, {
		refs: params.removed.map(({ id }) => ({ tagName: 'FCDA', id })),
	})
	const dataSets = await readLevel(query, { refs: records.flatMap(parentOf) })
	const holders = await readLevel(query, { refs: dataSets.flatMap(parentOf) })
	const blocks = await readLevel(query, {
		refs: holders.flatMap((holder) =>
			holder.children.filter((child) => CONF_REV_CONTROL_TAGS.has(child.tagName)),
		),
	})
	const dataSetById = new Map(dataSets.map((dataSet) => [dataSet.id, dataSet]))
	const groupIdOf = new Map(params.removed.map(({ id, groupId }) => [id, groupId]))
	return records.flatMap((record): DataSetEntry[] => {
		const dataSet = record.parent ? dataSetById.get(record.parent.id) : undefined
		if (!dataSet?.parent) return []
		const holderId = dataSet.parent.id
		const name = readAttribute({ record: dataSet, name: 'name', defaults: 'none' })
		const blockUuids = new Set(
			blocks.flatMap((block) =>
				block.parent?.id === holderId &&
				readAttribute({ record: block, name: 'datSet', defaults: 'none' }) === name
					? [readAttribute({ record: block, name: 'uuid', defaults: 'none' })]
					: [],
			),
		)
		return [
			{
				lnUuid: readAttribute({ record, name: 'lnUuid', defaults: 'none' }),
				doName: readAttribute({ record, name: 'doName', defaults: 'none' }),
				daName: readAttribute({ record, name: 'daName', defaults: 'none' }),
				blockUuids,
				groupId: groupIdOf.get(record.id) ?? '',
			},
		]
	})
}

/** The records of one level, read at once: those the store no longer holds left out. */
async function readLevel(
	query: Core.Query<Config>,
	params: { refs: readonly { tagName: string; id: string }[] },
): Promise<Core.AnyTrackedRecord[]> {
	if (params.refs.length === 0) return []
	const found = await query.any.getRecords([...params.refs] as Scl.Ref<Scl.ElementsOf>[])
	return found.filter((record): record is Core.AnyTrackedRecord => record !== undefined)
}

/** A record's parent as a ref to read, none for the root. */
function parentOf(record: Core.AnyTrackedRecord): { tagName: string; id: string }[] {
	return record.parent ? [record.parent] : []
}

/**
 * Whether an input subscribes, through one of the entry's control blocks, to data the entry sends: the same logical
 * node (by uuid), and the data the entry sends, part of it, or data holding it.
 */
function subscribes(params: { input: Core.AnyTrackedRecord; entry: DataSetEntry }): boolean {
	const { input, entry } = params
	function read(name: string): string {
		return readAttribute({ record: input, name, defaults: 'none' })
	}
	if (!entry.lnUuid || read('lnUuid') !== entry.lnUuid) return false
	if (!entry.blockUuids.has(read('srcCBUuid'))) return false
	// the input names the data the entry sends, part of it, or data holding it (a whole data object)
	const doName = read('doName')
	const daName = read('daName')
	if (isWithin({ path: doName, below: entry.doName })) {
		return !entry.daName || !daName || overlaps({ path: daName, other: entry.daName })
	}
	return isWithin({ path: entry.doName, below: doName }) && !daName
}

/** Whether two dotted data paths name the same data, or one names data holding the other. */
function overlaps(params: { path: string; other: string }): boolean {
	const { path, other } = params
	return isWithin({ path, below: other }) || isWithin({ path: other, below: path })
}

/** Whether a dotted data path is the one given or below it. */
function isWithin(params: { path: string; below: string }): boolean {
	const { path, below } = params
	return path === below || path.startsWith(`${below}.`)
}

/** The name of the IED holding each record, by the record's id: none for a record outside every IED. */
async function owningIeds(
	reader: IedReader,
	params: { records: readonly AnyRawRecord[] },
): Promise<Map<string, string>> {
	const { records } = params
	const ancestries = await readAncestries({ records, query: reader })
	const owners = new Map<string, string>()
	for (const record of records) {
		const top = record.tagName === 'IED' ? record : ancestries.get(record.id)?.[0]
		if (top?.tagName !== 'IED') continue
		owners.set(record.id, readAttribute({ record: top, name: 'name', defaults: 'none' }))
	}
	return owners
}

/** The groups to block: each group named, the groups it waits for and the groups waiting for one of them. */
function blockedGroupsOf(params: {
	groups: readonly DecisionGroup[]
	named: ReadonlySet<string>
}): ReadonlySet<string> {
	const { groups, named } = params
	const waitedFor = groups.flatMap((group) => (named.has(group.id) ? group.dependsOn : []))
	const blocking = new Set([...named, ...waitedFor])
	const waiting = groups.flatMap((group) =>
		group.dependsOn.some((dependency) => blocking.has(dependency)) ? [group.id] : [],
	)
	return new Set([...blocking, ...waiting])
}

/** A tree's nodes, the root first. */
function flatten(node: AnyTreeRecord): AnyTreeRecord[] {
	return [node, ...node.tree.flatMap(flatten)]
}
