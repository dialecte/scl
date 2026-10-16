import { CONTROL_BLOCK_TAGS } from '../constants/control-blocks.constants'
import {
	ACCESS_POINT_TAGS,
	IED_SECTION_SELECT,
	LOGICAL_DEVICE_TAGS,
	LOGICAL_NODE_TAGS,
} from '../constants/ied-section.constants'
import { REGISTRATION_TAGS } from '../constants/registration.constants'
import { walkTree } from './walk-tree'

import {
	buildPathFromAncestry,
	getPathSegment,
} from '@/v2019C1/extensions/reference/query/build/path-segment'
import { readRawAttribute } from '@/v2019C1/extensions/reference/query/build/raw-attribute'
import { targetKey } from '@/v2019C1/extensions/reference/query/ied-tuple/target-key'
import { targetTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/target-tuple-address'

import type { ControlBlockNode, IedNode, IedSection } from './ied-section.types'
import type { SectionNode, TreeNode } from './section-node.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Reads the IED section once: one tree of every IED down to its logical nodes and what they hold,
 * and from it every map a dataflow query needs. Which IED, logical device and logical node holds an
 * element comes from the tree, never from walking up the document.
 */
export async function readIedSection(query: Core.Query<Config>): Promise<IedSection> {
	const root = await query.getTree({ tagName: 'SCL' }, { select: IED_SECTION_SELECT })
	const extRefs: IedNode<'ExtRef'>[] = []
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
	const lnsByPath = new Map<string, IedNode<'LN' | 'LN0'>>()
	const iedOfLn = new Map<string, Scl.Ref<'IED'>>()
	const registrationsOf = new Map<string, IedNode<'IEDName' | 'ClientLN'>[]>()

	walkTree({
		nodes: (root?.tree ?? []) as readonly TreeNode[],
		visit(sectionNode) {
			const node = inIed(sectionNode)
			if (!node) return
			const { tagName } = node.record

			const uuid = readRawAttribute({ record: node.record, name: 'uuid' })

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
				const path = elementPath(node)
				if (path) lnsByPath.set(path, logicalNode)
				const address = targetTupleAddress({ record: node.record, ancestry: node.ancestry })
				if (address) lnsByAddress.set(address, logicalNode)
				if (uuid) {
					lnsByUuid.set(uuid, logicalNode)
					uuidById.set(node.record.id, uuid)
				}
				iedOfLn.set(node.record.id, node.ied)
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
		},
	})

	return {
		extRefs,
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
		lnsByPath,
		iedOfLn,
	}
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
