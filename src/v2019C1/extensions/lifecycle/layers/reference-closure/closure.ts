import {
	CONTROL_BLOCK_ADDRESS_TAGS,
	CLOSURE_MODEL_TAGS,
	CONTROL_BLOCK_SEED_TAGS,
	CUT_INSIDE_TAGS,
	KEPT_UNDER_INTERFACE,
} from './closure.constants'

import { invariant } from '@dialecte/core/utils'

import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { LNODE_TYPE_ATTRIBUTE } from '@/v2019C1/extensions/data-model/query/data-types.constants'
import { readDataTypes } from '@/v2019C1/extensions/dataflow/query/read-data-types'
import { isNativeRecord } from '@/v2019C1/extensions/reference/query/find/is-native-record'
import { TUPLE_TARGET_KINDS } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.constants'
import { referrerTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/referrer-tuple-address'
import { targetTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/target-tuple-address'
import { readAttribute } from '@/v2019C1/helpers'

import type {
	ClosureModel,
	ClosureModelIndex,
	ClosurePlan,
	ClosureSeed,
	ClosureTypeModel,
	IedClosure,
} from './closure.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TupleReferencePair } from '@/v2019C1/constants/reference-pairs.types'
import type * as Core from '@dialecte/core'

/**
 * Read what a closure reads, the document's own records only: every IED, its IED section (access points and the servers
 * they serve, servers, logical devices and nodes, data sets and their members, control blocks) and every connection with
 * its GSE and SMV, in one read of the document by tag (a closure follows references across IEDs). The IEDs asked are
 * checked: one the document does not hold is refused.
 */
export async function readClosureModel(
	query: Core.Query<Config>,
	params: { iedRefs: readonly Scl.Ref<'IED'>[] },
): Promise<ClosureModel> {
	const root = await query.getRoot()
	const found = (await query.findDescendants(root, { collect: [...CLOSURE_MODEL_TAGS] })) as Record<
		string,
		Core.AnyRawRecord[] | undefined
	>
	const model = Object.fromEntries(
		CLOSURE_MODEL_TAGS.map((tag) => [tag, (found[tag] ?? []).filter(isNativeRecord)]),
	) as unknown as ClosureModel
	const held = new Set(model.IED.map((ied) => ied.id))
	for (const iedRef of params.iedRefs) {
		invariant(held.has(iedRef.id), {
			key: 'ELEMENT_NOT_FOUND',
			ref: iedRef,
			detail: 'readClosureModel: IED not found',
		})
	}
	return model
}

/**
 * Keep each seed and everything it references in the IED section, nothing dangling. References are resolved through the
 * tuple reference registry (an IED's element is named by its IED, so two IEDs sharing names never mix):
 * - an IED seeded `whole` keeps its subtree;
 * - a control block seeded `interface` keeps its holder (LN0 or LN), logical device with its LN0, server (with its
 *   authentication), access point and IED; its data set and the members it lists; for each member, the logical node it
 *   names with its logical device, the device's LN0, server and access point; every access point serving a kept access
 *   point's server (`ServerAt`), with that element; under each connection of a kept access point, its address and
 *   physical connection and the GSE / SMV of each kept control block.
 * Under an IED kept for its interface only, everything else is left out: values, inputs and outputs, receivers and report
 * clients, associations, key distribution entries, services and security, texts and private content, and every logical
 * device, logical node, data set and control block nothing names; its connections on an access point left out go whole
 * (`droppedConnections`); the IED is marked `engRight="fix"` (not engineered in the file). A kept data set member whose
 * logical node the IED does not hold is listed (`unresolvedMembers`). Pure: works on the model read.
 *
 * @intent which elements must travel with a control block, the partial IED of a sender, close a control block over its data set, keep an element and everything it references
 */
export function planClosure(params: {
	model: ClosureModel
	seeds: readonly ClosureSeed[]
}): ClosurePlan {
	const { model, seeds } = params
	const index = indexModel(model)
	for (const seed of seeds) assertSeed({ index, seed })
	const wholeIeds = new Set(seeds.flatMap((seed) => (seed.depth === 'whole' ? [seed.ref.id] : [])))
	const blockClosures = seeds.flatMap((seed) =>
		seed.depth === 'interface' ? [controlBlockClosure({ index, controlBlockId: seed.ref.id })] : [],
	)
	const keptInIeds = new Set(blockClosures.flatMap((closure) => closure.kept))
	const partialIeds = new Set(
		model.IED.filter((ied) => !wholeIeds.has(ied.id) && keptInIeds.has(ied.id)).map(
			(ied) => ied.id,
		),
	)
	const served = servingAccessPoints({ index, model, kept: keptInIeds, partialIeds })
	const keptAccessPoints = new Set([...keptInIeds, ...served])
	const connections = model.ConnectedAP.flatMap(function connectionOfPartialIed(connection) {
		const accessPoint = resolveReferrer({ index, record: connection })
		if (!accessPoint || !partialIeds.has(iedIdOf({ index, recordId: accessPoint }) ?? '')) return []
		return [{ connection, kept: keptAccessPoints.has(accessPoint) }]
	})
	const keptConnections = connections.filter((entry) => entry.kept).map((entry) => entry.connection)
	const kept = new Set([
		...keptAccessPoints,
		...keptConnections.flatMap((connection) =>
			connectionClosure({ index, connection, kept: keptInIeds }),
		),
	])
	const ieds = new Map<string, IedClosure>([
		...[...wholeIeds].map((id): [string, IedClosure] => [
			id,
			{ depth: 'whole', leaveOut: new Set() },
		]),
		...[...partialIeds].map((id): [string, IedClosure] => [
			id,
			{
				depth: 'interface',
				leaveOut: new Set(leftOutUnder({ index, rootId: id, kept })),
				engRight: 'fix',
			},
		]),
	])
	return {
		ieds,
		connections: new Map(
			keptConnections.map((connection) => [
				connection.id,
				{ leaveOut: new Set(leftOutUnder({ index, rootId: connection.id, kept })) },
			]),
		),
		droppedConnections: new Set(
			connections.filter((entry) => !entry.kept).map((entry) => entry.connection.id),
		),
		unresolvedMembers: new Set(blockClosures.flatMap((closure) => closure.unresolved)),
		logicalNodes: new Set(
			[...model.LN0, ...model.LN]
				.filter((ln) => kept.has(ln.id) || wholeIeds.has(iedIdOf({ index, recordId: ln.id }) ?? ''))
				.map((ln) => ln.id),
		),
	}
}

/** A seed names what the model holds: an IED for a whole seed, a control block for an interface seed. */
function assertSeed(params: { index: ClosureModelIndex; seed: ClosureSeed }): void {
	const { index, seed } = params
	const record = index.byId.get(seed.ref.id)
	const named =
		seed.depth === 'whole'
			? record?.tagName === 'IED'
			: CONTROL_BLOCK_SEED_TAGS.has(record?.tagName ?? '')
	invariant(named && record?.tagName === seed.ref.tagName, {
		key: 'ASSERTION_FAILED',
		detail: `planClosure: a ${seed.depth} seed names ${seed.depth === 'whole' ? 'an IED' : 'a control block'} of the model`,
	})
}

/** The model by id, and every tuple target (access points, logical devices, logical nodes, control blocks) by address. */
function indexModel(model: ClosureModel): ClosureModelIndex {
	const byId = new Map<string, Core.AnyRawRecord>(
		CLOSURE_MODEL_TAGS.flatMap((tag) =>
			(model[tag] as readonly Core.AnyRawRecord[]).map((record) => [record.id, record] as const),
		),
	)
	const base: ClosureModelIndex = { byId, targets: new Map() }
	const targets = new Map(
		[...byId.values()].flatMap(function addressOf(record): [string, string][] {
			if (!TUPLE_TARGET_KINDS.has(record.tagName)) return []
			const ancestry = ancestryOf({ index: base, recordId: record.id })
			const address = targetTupleAddress({ record, ancestry })
			return address ? [[address, record.id]] : []
		}),
	)
	return { byId, targets }
}

/** The ancestors of a record the model holds, outermost first. */
function ancestryOf(params: { index: ClosureModelIndex; recordId: string }): Core.AnyRawRecord[] {
	const { index } = params
	const ancestors: Core.AnyRawRecord[] = []
	let parent = index.byId.get(params.recordId)?.parent
	while (parent) {
		const record = index.byId.get(parent.id)
		if (!record) break
		ancestors.unshift(record)
		parent = record.parent
	}
	return ancestors
}

/** The element a tuple referrer names (a data set member, a server reference, a connection, a GSE or SMV), by id. */
function resolveReferrer(params: {
	index: ClosureModelIndex
	record: Core.AnyRawRecord
}): string | undefined {
	const { index, record } = params
	const pairs =
		(TUPLE_REFERENCE_PAIRS as Record<string, readonly TupleReferencePair[] | undefined>)[
			record.tagName
		] ?? []
	const ancestry = ancestryOf({ index, recordId: record.id })
	for (const pair of pairs) {
		const address = referrerTupleAddress({ pair, record, ancestry })
		const target = address ? index.targets.get(address) : undefined
		if (target) return target
	}
	return undefined
}

function childrenOf(params: {
	index: ClosureModelIndex
	id: string
}): readonly { tagName: string; id: string }[] {
	return params.index.byId.get(params.id)?.children ?? []
}

/** The IED a record of the model sits in, walking its parents step by step. */
function iedIdOf(params: { index: ClosureModelIndex; recordId: string }): string | undefined {
	const { index } = params
	let record = index.byId.get(params.recordId)
	while (record && record.tagName !== 'IED') {
		record = record.parent ? index.byId.get(record.parent.id) : undefined
	}
	return record?.id
}

/** A record and its ancestors up to its IED. */
function withAncestors(params: { index: ClosureModelIndex; recordId: string }): string[] {
	const { index } = params
	const ids: string[] = []
	let record = index.byId.get(params.recordId)
	while (record) {
		ids.push(record.id)
		if (record.tagName === 'IED') break
		record = record.parent ? index.byId.get(record.parent.id) : undefined
	}
	return ids
}

/** A logical node with its ancestors and the LN0 of its logical device (mandatory in it). */
function logicalNodeClosure(params: { index: ClosureModelIndex; logicalNodeId: string }): string[] {
	const { index, logicalNodeId } = params
	const ldevice = index.byId.get(index.byId.get(logicalNodeId)?.parent?.id ?? '')
	const ln0 = ldevice
		? childrenOf({ index, id: ldevice.id }).filter((child) => child.tagName === 'LN0')
		: []
	return [...withAncestors({ index, recordId: logicalNodeId }), ...ln0.map((child) => child.id)]
}

/**
 * What a control block keeps: itself up to its IED, the LN0 of its logical device, its data set (in its holder), the
 * members it lists and the logical nodes they name; the members naming nothing the IED holds, listed apart.
 */
function controlBlockClosure(params: { index: ClosureModelIndex; controlBlockId: string }): {
	kept: string[]
	unresolved: string[]
} {
	const { index, controlBlockId } = params
	const controlBlock = index.byId.get(controlBlockId) as Core.AnyRawRecord
	const holderId = controlBlock.parent?.id ?? ''
	const dataSetName = readAttribute({ record: controlBlock, name: 'datSet', defaults: 'none' })
	const dataSet = childrenOf({ index, id: holderId })
		.map((child) => index.byId.get(child.id))
		.find(
			(child) =>
				child?.tagName === 'DataSet' &&
				readAttribute({ record: child, name: 'name' }) === dataSetName,
		)
	const members = dataSet ? childrenOf({ index, id: dataSet.id }) : []
	const resolved = members.map(function resolveMember(member) {
		const record = index.byId.get(member.id)
		return { member, target: record ? resolveReferrer({ index, record }) : undefined }
	})
	return {
		kept: [
			...withAncestors({ index, recordId: controlBlock.id }),
			...logicalNodeClosure({ index, logicalNodeId: holderId }),
			...(dataSet ? [dataSet.id] : []),
			...resolved.flatMap(({ member, target }) => [
				member.id,
				...(target ? logicalNodeClosure({ index, logicalNodeId: target }) : []),
			]),
		],
		unresolved: resolved.filter(({ target }) => !target).map(({ member }) => member.id),
	}
}

/** The access points of a partial IED serving the server of a kept access point (`ServerAt`), with that element. */
function servingAccessPoints(params: {
	index: ClosureModelIndex
	model: ClosureModel
	kept: ReadonlySet<string>
	partialIeds: ReadonlySet<string>
}): string[] {
	const { index, model, kept, partialIeds } = params
	return model.ServerAt.flatMap(function servingOf(serverAt) {
		const accessPoint = serverAt.parent?.id
		const served = resolveReferrer({ index, record: serverAt })
		if (!accessPoint || !served || !kept.has(served)) return []
		return partialIeds.has(iedIdOf({ index, recordId: accessPoint }) ?? '')
			? [accessPoint, serverAt.id]
			: []
	})
}

/** What a kept connection keeps: itself, its address and physical connection, and the GSE / SMV of kept control blocks. */
function connectionClosure(params: {
	index: ClosureModelIndex
	connection: Core.AnyRawRecord
	kept: ReadonlySet<string>
}): string[] {
	const { index, connection, kept } = params
	const keptChildren = childrenOf({ index, id: connection.id }).filter(function isKeptChild(child) {
		if (child.tagName === 'Address' || child.tagName === 'PhysConn') return true
		const address = index.byId.get(child.id)
		if (!address || !CONTROL_BLOCK_ADDRESS_TAGS.has(child.tagName)) return false
		const controlBlock = resolveReferrer({ index, record: address })
		return controlBlock !== undefined && kept.has(controlBlock)
	})
	return [connection.id, ...keptChildren.map((child) => child.id)]
}

/**
 * The topmost records under a kept record left out: a child not kept goes (with its subtree); a kept child is cut inside
 * when it is a frame of the IED section or of a connection (an access point down to a control block), else kept whole;
 * under a kept element, what it keeps with it whole stays (a data set's members, a server's authentication, a control
 * block's settings). A control block's receivers and report clients are never kept with it, so they go.
 */
function leftOutUnder(params: {
	index: ClosureModelIndex
	rootId: string
	kept: ReadonlySet<string>
}): string[] {
	const { index, rootId, kept } = params
	const record = index.byId.get(rootId)
	const keptWhole = (record && KEPT_UNDER_INTERFACE.get(record.tagName)) || new Set<string>()
	return childrenOf({ index, id: rootId }).flatMap(function leftOutOf(child) {
		if (kept.has(child.id) || keptWhole.has(child.tagName)) {
			return CUT_INSIDE_TAGS.has(child.tagName) && index.byId.has(child.id)
				? leftOutUnder({ index, rootId: child.id, kept })
				: []
		}
		return [child.id]
	})
}

/** Read the data types of a document a type closure follows: its data model, read once (a seam for the copy's merge). */
export async function readClosureTypeModel(query: Core.Query<Config>): Promise<ClosureTypeModel> {
	return readDataTypes(query)
}

/**
 * The types the logical nodes need: their logical node type, then every data object, data attribute and enumeration type
 * its data objects, sub data objects, data attributes and basic data attributes name, transitively, each once.
 *
 * @intent the data types an element needs, the type closure of logical nodes, which types travel with a copy or an export
 */
export function planTypeClosure(params: {
	types: ClosureTypeModel
	logicalNodes: readonly Core.AnyRawRecord[]
}): ReadonlySet<string> {
	const { types, logicalNodes } = params
	const reached = new Set<string>()
	const pending = logicalNodes.flatMap((ln) => {
		const lnType = readAttribute({ record: ln, name: LNODE_TYPE_ATTRIBUTE, defaults: 'none' })
		return lnType ? [lnType] : []
	})
	while (pending.length > 0) {
		const typeId = pending.pop() as string
		if (reached.has(typeId)) continue
		reached.add(typeId)
		const doType = types.doTypesById.get(typeId)
		const members = [
			...(types.lnodeTypesById.get(typeId) ?? []),
			...(doType ? [...doType.subObjects, ...doType.attributes] : []),
			...(types.daTypesById.get(typeId) ?? []),
		]
		pending.push(...members.flatMap((member) => (member.type ? [member.type] : [])))
	}
	return reached
}
