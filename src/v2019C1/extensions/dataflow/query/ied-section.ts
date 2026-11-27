import { CONTROL_BLOCK_TAGS } from '../constants/control-blocks.constants'
import {
	ACCESS_POINT_TAGS,
	IED_SECTION_SELECT,
	LOGICAL_DEVICE_TAGS,
	LOGICAL_NODE_TAGS,
} from '../constants/ied-section.constants'
import { REGISTRATION_TAGS } from '../constants/registration.constants'
import { nativeSectionNodesOf } from './section-nodes'

import {
	buildPathFromAncestry,
	getPathSegment,
} from '@/v2019C1/extensions/reference/query/build/path-segment'
import { collectWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry'
import { targetKey } from '@/v2019C1/extensions/reference/query/ied-tuple/target-key'
import { targetTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/target-tuple-address'
import { readAttribute } from '@/v2019C1/helpers'

import type { ControlBlockNode, IedNode, IedSection } from './ied-section.types'
import type { SectionNode } from './section-node.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { CollectedWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry.types'
import type * as Core from '@dialecte/core'

/**
 * Reads the IED section once: every IED down to its logical nodes and what they hold, and from it
 * every map a dataflow query needs. Which IED, logical device and logical node holds an element
 * comes from the records read, never from walking up the document. Vendor payload is not read as part
 * of the section, whatever its tag.
 */
export async function readIedSection(query: Core.Query<Config>): Promise<IedSection> {
	const collected = await collectWithAncestry(query, {
		select: IED_SECTION_SELECT,
	})
	return iedSectionOf({ collected })
}

/** The IED section before staged operations: original records replace their writes, deleted records return. */
export async function readIedSectionBefore(params: {
	query: Core.Query<Config>
	operations: ReadonlyArray<Scl.Operation>
}): Promise<IedSection> {
	const { query, operations } = params
	const current = await collectWithAncestry(query, {
		select: IED_SECTION_SELECT,
	})
	const created = new Set(
		operations.flatMap((operation) =>
			operation.status === 'created' ? [operation.newRecord.id] : [],
		),
	)
	const records = new Map(
		current.records
			.filter((record) => !created.has(record.id))
			.map((record) => [record.id, record]),
	)
	const original = new Map<string, Core.AnyRawRecord>()
	for (const operation of operations) {
		const before = operation.status === 'created' ? undefined : operation.oldRecord
		if (before && !created.has(before.id) && !original.has(before.id))
			original.set(before.id, before)
	}
	for (const [id, record] of original) records.set(id, record)
	return collectedIedSection({ records: [...records.values()] })
}

/** The IED section after staged operations: the last write of each record is kept and deleted records leave. */
export async function readIedSectionAfter(params: {
	query: Core.Query<Config>
	operations: ReadonlyArray<Scl.Operation>
}): Promise<IedSection> {
	const { query, operations } = params
	const current = await collectWithAncestry(query, {
		select: IED_SECTION_SELECT,
	})
	const records = new Map(current.records.map((record) => [record.id, record]))
	for (const operation of operations) {
		if (operation.status === 'deleted') {
			records.delete(operation.oldRecord.id)
			continue
		}
		records.set(operation.newRecord.id, operation.newRecord)
	}
	return collectedIedSection({ records: [...records.values()] })
}

function collectedIedSection(params: { records: readonly Core.AnyRawRecord[] }): IedSection {
	const ordered = recordsInDocumentOrder(params)
	const byId = new Map(ordered.map((record) => [record.id, record]))
	return iedSectionOf({
		collected: {
			records: ordered,
			ancestryOf(id) {
				const ancestry = []
				let parent = byId.get(id)?.parent
				while (parent) {
					const record = byId.get(parent.id)
					if (!record) break
					ancestry.unshift(record)
					parent = record.parent
				}
				return ancestry
			},
		},
	})
}

/** Index the collected IED records once for every dataflow lookup. */
function iedSectionOf(params: { collected: CollectedWithAncestry }): IedSection {
	const { collected } = params
	const extRefs: IedNode<'ExtRef'>[] = []
	const logicalNodes: IedNode<'LN' | 'LN0'>[] = []
	const implementations = new Map<string, IedNode<'ExtRef' | 'ExtCtrl'>>()
	const accessPointUuidsByIed = new Map<string, Set<string>>()
	const uuidById = new Map<string, string>()
	const lnsByUuid = new Map<string, IedNode<'LN' | 'LN0'>>()
	const lnsByAddress = new Map<string, IedNode<'LN' | 'LN0'>>()
	const iedByName = new Map<string, Scl.Ref<'IED'>>()
	const extRefsByUuid = new Map<string, IedNode<'ExtRef'>>()
	const extRefsByPath = new Map<string, IedNode<'ExtRef'>[]>()
	const extCtrlsByUuid = new Map<string, IedNode<'ExtCtrl'>>()
	const extCtrlsByPath = new Map<string, IedNode<'ExtCtrl'>[]>()
	const controlBlocks = new Map<string, ControlBlockNode>()
	const controlBlocksByUuid = new Map<string, ControlBlockNode>()
	const controlBlocksByAddress = new Map<string, ControlBlockNode>()
	const registrationsOf = new Map<string, IedNode<'IEDName' | 'ClientLN'>[]>()

	for (const sectionNode of nativeSectionNodesOf(collected)) {
		const node = inIed(sectionNode)
		if (!node) continue
		const { tagName } = node.record

		const uuid = readAttribute({ record: node.record, name: 'uuid', defaults: 'none' })

		if (tagName === 'IED') {
			const name = getPathSegment(node.record)?.segment
			if (name) iedByName.set(name, node.ied)
		}

		if (uuid && (ACCESS_POINT_TAGS.includes(tagName) || LOGICAL_DEVICE_TAGS.includes(tagName))) {
			uuidById.set(node.record.id, uuid)
		}

		if (uuid && ACCESS_POINT_TAGS.includes(tagName)) {
			const uuids = accessPointUuidsByIed.get(node.ied.id) ?? new Set<string>()
			accessPointUuidsByIed.set(node.ied.id, uuids.add(uuid))
		}

		if (tagName === 'ExtRef' || tagName === 'ExtCtrl') {
			implementations.set(node.record.id, node as IedNode<'ExtRef' | 'ExtCtrl'>)
		}

		if (tagName === 'ExtRef') {
			extRefs.push(node as IedNode<'ExtRef'>)
			indexImplementation({ node, uuid, byUuid: extRefsByUuid, byPath: extRefsByPath })
		}

		if (tagName === 'ExtCtrl') {
			indexImplementation({ node, uuid, byUuid: extCtrlsByUuid, byPath: extCtrlsByPath })
		}

		if (LOGICAL_NODE_TAGS.includes(tagName)) {
			const logicalNode = node as IedNode<'LN' | 'LN0'>
			logicalNodes.push(logicalNode)
			const address = targetTupleAddress({ record: node.record, ancestry: node.ancestry })
			if (address) lnsByAddress.set(address, logicalNode)
			if (uuid) {
				lnsByUuid.set(uuid, logicalNode)
				uuidById.set(node.record.id, uuid)
			}
		}

		if (CONTROL_BLOCK_TAGS.includes(tagName)) {
			const registrations: IedNode<'IEDName' | 'ClientLN'>[] = []
			registrationsOf.set(node.record.id, registrations)
			const controlBlock = { ...node, registrations } as ControlBlockNode
			controlBlocks.set(node.record.id, controlBlock)
			if (uuid) controlBlocksByUuid.set(uuid, controlBlock)
			const address = targetTupleAddress({ record: node.record, ancestry: node.ancestry })
			if (address) {
				controlBlocksByAddress.set(targetKey({ address, tagName }), controlBlock)
			}
		}

		if (REGISTRATION_TAGS.has(tagName)) {
			const controlBlock = node.ancestry.findLast((record) =>
				CONTROL_BLOCK_TAGS.includes(record.tagName),
			)
			registrationsOf.get(controlBlock?.id ?? '')?.push(node as IedNode<'IEDName' | 'ClientLN'>)
		}
	}

	return {
		extRefs,
		logicalNodes,
		implementations,
		iedByName,
		accessPointUuidsByIed,
		uuidById,
		lnsByUuid,
		lnsByAddress,
		extRefsByUuid,
		extRefsByPath,
		extCtrlsByUuid,
		extCtrlsByPath,
		controlBlocks,
		controlBlocksByUuid,
		controlBlocksByAddress,
	}
}

/** A pre-commit operation view in parent-before-child document order. */
function recordsInDocumentOrder(params: {
	records: readonly Core.AnyRawRecord[]
}): Core.AnyRawRecord[] {
	const byId = new Map(params.records.map((record) => [record.id, record]))
	const visited = new Set<string>()
	const ordered: Core.AnyRawRecord[] = []
	function visit(record: Core.AnyRawRecord): void {
		if (visited.has(record.id)) return
		visited.add(record.id)
		ordered.push(record)
		for (const child of record.children) {
			const found = byId.get(child.id)
			if (found) visit(found)
		}
	}
	for (const record of params.records) {
		if (!record.parent || !byId.has(record.parent.id)) visit(record)
	}
	for (const record of params.records) visit(record)
	return ordered
}

/** Indexes an ExtRef / ExtCtrl by its uuid and by its path, the elements of one path kept in document order. */
function indexImplementation<GenericElement extends 'ExtRef' | 'ExtCtrl'>(params: {
	node: IedNode
	uuid: string | undefined
	byUuid: Map<string, IedNode<GenericElement>>
	byPath: Map<string, IedNode<GenericElement>[]>
}): void {
	const { node, uuid, byUuid, byPath } = params
	const element = node as IedNode<GenericElement>
	if (uuid) byUuid.set(uuid, element)
	const path = elementPath(node)
	if (path) byPath.set(path, [...(byPath.get(path) ?? []), element])
}

/**
 * The path of an element of the IED section, read from the records above it; `undefined` for an
 * element with no segment of its own (an ExtRef without internal address would take the path of its
 * logical node).
 */
function elementPath(node: SectionNode): string | undefined {
	const path = buildPathFromAncestry({ record: node.record, ancestry: node.ancestry })
	return path?.segments.at(-1)?.ref.id === node.record.id ? path.path : undefined
}

/** The node with the IED, logical device and logical node holding it (itself, for a logical node). */
function inIed(node: SectionNode): IedNode | undefined {
	const { record, ancestry } = node
	const scope = [...ancestry, record]
	const ied = scope.find((candidate) => candidate.tagName === 'IED')
	if (!ied) return undefined
	const ldevice = scope.findLast((candidate) => LOGICAL_DEVICE_TAGS.includes(candidate.tagName))
	const ln = scope.findLast((candidate) => LOGICAL_NODE_TAGS.includes(candidate.tagName))
	return {
		...node,
		ied: { tagName: 'IED', id: ied.id },
		ldevice: ldevice && { tagName: 'LDevice', id: ldevice.id },
		ln: ln && ({ tagName: ln.tagName, id: ln.id } as Scl.Ref<'LN' | 'LN0'>),
	}
}
