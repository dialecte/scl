import {
	CONNECTION_REFERENCE_TAGS,
	EQUIPMENT_PART_TAGS,
	LNODE_SCOPE_TAGS,
} from './ied-process.constants'

import { resolveDefinition } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { readAttribute } from '@/v2019C1/helpers'
import { requiredChildTags } from '@/v2019C1/helpers/requires-child-element'

import type { ProcessIndex } from './ied-process.types'
import type { SectionNode } from '@/v2019C1/extensions/dataflow/query/section-node.types'

/**
 * The frame of the written LNodes: each with every element above it, then, until nothing is added, what the frame
 * needs to stay valid and connected. An element of the frame that must hold a child of a kind (a voltage level a bay,
 * a line an equipment) and holds none in the frame gets the first one of the source; an equipment of the frame keeps
 * its parts (windings, tap changers, sub-equipment); an equipment connected to a connectivity node gets that node,
 * with what is above it. Nothing else of an element pulled in this way
 * is: its other equipment, functions and nodes stay out.
 */
export function closeProcessFrame(params: {
	index: ProcessIndex
	lnodes: ReadonlySet<string>
}): ReadonlySet<string> {
	const { index } = params
	let frame: ReadonlySet<string> = withAncestry({ index, ids: params.lnodes })
	for (;;) {
		const required = requiredChildren({ index, frame })
		const parts = equipmentParts({ index, frame })
		const connected = connectedNodes({ index, frame })
		const grown = withAncestry({
			index,
			ids: new Set([...frame, ...required, ...parts, ...connected]),
		})
		if (grown.size === frame.size) return frame
		frame = grown
	}
}

/** The elements given, with every element above each. */
function withAncestry(params: {
	index: ProcessIndex
	ids: ReadonlySet<string>
}): ReadonlySet<string> {
	const ids = new Set(params.ids)
	for (const id of params.ids) {
		for (const ancestor of params.index.byId.get(id)?.ancestry ?? []) ids.add(ancestor.id)
	}
	return ids
}

/** For each element of the frame, the first source child of each kind it must hold and holds none of in the frame. */
function requiredChildren(params: { index: ProcessIndex; frame: ReadonlySet<string> }): string[] {
	const { index, frame } = params
	const added: string[] = []
	for (const id of frame) {
		const node = index.byId.get(id)
		if (!node || !LNODE_SCOPE_TAGS.has(node.record.tagName)) continue
		const children = index.childrenOf.get(id) ?? []
		const definition = resolveDefinition({
			dialecteConfig: SCL_DIALECTE_CONFIG,
			record: node.record,
		})
		for (const tagName of requiredChildTags(definition?.contentModel)) {
			const ofKind = children.filter(function isOfKind(child) {
				return child.record.tagName === tagName
			})
			if (ofKind.some(inFrame(frame))) continue
			const [first] = ofKind
			if (first) added.push(first.record.id)
		}
	}
	return added
}

/** The parts of each equipment of the frame. */
function equipmentParts(params: { index: ProcessIndex; frame: ReadonlySet<string> }): string[] {
	const { index, frame } = params
	return [...frame].flatMap(function partsOf(id) {
		return (index.childrenOf.get(id) ?? [])
			.filter(function isPart(child) {
				return EQUIPMENT_PART_TAGS.has(child.record.tagName)
			})
			.map(function idOf(child) {
				return child.record.id
			})
	})
}

/** The connectivity nodes the connections of the frame's equipment name, by uuid first, else by path. */
function connectedNodes(params: { index: ProcessIndex; frame: ReadonlySet<string> }): string[] {
	const { index, frame } = params
	const added: string[] = []
	for (const node of index.nodes) {
		const { record, ancestry } = node
		const holder = ancestry.at(-1)
		if (!CONNECTION_REFERENCE_TAGS.has(record.tagName) || !holder || !frame.has(holder.id)) continue
		const pairs = UUID_REFERENCE_PAIRS[record.tagName as 'Terminal' | 'NeutralPoint']
		for (const pair of pairs) {
			const uuid = readAttribute({ record, name: pair.attribute.uuid, defaults: 'none' })
			const path = readAttribute({ record, name: pair.attribute.path, defaults: 'none' })
			const target = uuid ? index.byUuid.get(uuid) : index.byPath.get(path)
			if (target?.record.tagName === 'ConnectivityNode') added.push(target.record.id)
		}
	}
	return added
}

function inFrame(frame: ReadonlySet<string>): (node: SectionNode) => boolean {
	return function isInFrame(node) {
		return frame.has(node.record.id)
	}
}
