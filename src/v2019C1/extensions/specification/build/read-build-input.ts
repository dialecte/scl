import { FUNCTION_LIKES } from './build.constants'
import { readHeldValues, readValueTypes, specifiedValuesOf } from './read-values'

import { throwDialecteError } from '@dialecte/core'

import { readProcessSection } from '@/v2019C1/extensions/dataflow/query/process-section'
import { classifyIed } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds'
import { resolveMappedLNodes } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-lnodes'
import { readAttributes } from '@/v2019C1/helpers'

import type { BuildIedParams } from '../transaction/build-ied.types'
import type {
	BuildInput,
	SectionElement,
	TargetLDevice,
	TargetLogicalNode,
	TypeCandidate,
} from './build-input.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * What a build needs, read in a fixed number of reads whatever the number of LNodes: the target IED's subtree once,
 * the process section of the built document (and of the context document when it is another), the implementations
 * of the LNodes asked for, the LNodeTypes.
 */
export async function readBuildInput(
	query: Core.Query<Config>,
	params: BuildIedParams,
): Promise<BuildInput> {
	const contextQuery = params.contextQuery ?? query
	const iedRecord = await query.getRecord(params.ied)
	if (!iedRecord) {
		throwDialecteError('ELEMENT_NOT_FOUND', {
			ref: params.ied,
			detail: `the document holds no <IED> "${params.ied.id}"`,
		})
	}
	const kind = await classifyIed(query, { ied: params.ied })
	const subtree = await query.findDescendants(params.ied, {
		collect: ['Server', 'LDevice', 'LN0', 'LN'],
	})
	const asked = uniqueLNodes({ lnodes: params.lnodes })
	const lnodeRecords = await query.getRecords(asked)
	const missing = asked.find((lnode, position) => !lnodeRecords[position])
	if (missing) {
		throwDialecteError('ELEMENT_NOT_FOUND', {
			ref: missing,
			detail: `the document holds no <LNode> "${missing.id}"`,
		})
	}
	const section = await readProcessSection(query)
	const contextSection = contextQuery === query ? section : await readProcessSection(contextQuery)
	const implementations = await resolveMappedLNodes(query, { lnodes: asked })
	const types = await readTypeCandidates({ query, contextQuery })
	const specifiedValues = specifiedValuesOf({
		nodes: section.nodes,
		lnodeIds: new Set(asked.map((lnode) => lnode.id)),
	})
	const heldValues = await readHeldValues(query, {
		logicalNodes: [...implementations].flatMap(([lnodeId, implementation]) =>
			implementation.ied.id === params.ied.id && specifiedValues.has(lnodeId)
				? [implementation.ln]
				: [],
		),
	})
	const valueTypes = await readValueTypes({
		query,
		contextQuery,
		types,
		lnClasses: new Set(
			lnodeRecords.flatMap((record, position) =>
				specifiedValues.has(asked[position]?.id ?? '')
					? [readAttributes({ record: record as AnyRawRecord, defaults: 'none' }).lnClass ?? '']
					: [],
			),
		),
	})

	const lDevices = targetLDevicesOf({
		lDevices: subtree.LDevice ?? [],
		logicalNodes: [...(subtree.LN0 ?? []), ...(subtree.LN ?? [])],
	})
	return {
		ied: {
			ref: params.ied,
			name: readAttributes({ record: iedRecord, defaults: 'none' }).name ?? '',
			kind,
		},
		servers: (subtree.Server ?? []).map((server) => ({ tagName: 'Server', id: server.id })),
		lDevices,
		targetIedTypes: new Set(
			lDevices.flatMap((lDevice) => lDevice.logicalNodes.map((logicalNode) => logicalNode.lnType)),
		),
		lnodes: asked.map(function requestedOf(ref, position) {
			const record = lnodeRecords[position] as AnyRawRecord
			const section_ = section.lnodes.get(ref.id)
			return {
				ref,
				record,
				section: section_ && { record: section_.record, ancestry: section_.ancestry },
				implementation: implementations.get(ref.id),
			}
		}),
		boundLNodeOf: boundLNodesOf({
			iedName: readAttributes({ record: iedRecord, defaults: 'none' }).name ?? '',
			lDevices,
			lnodes: [...section.lnodes.values()],
		}),
		clashSet: contextSection.nodes.filter(isFunctionLike),
		types,
		specifiedValues,
		heldValues,
		valueTypes,
	}
}

/** The target's logical devices, each with the logical nodes it holds directly, in stored order. */
function targetLDevicesOf(params: {
	lDevices: readonly AnyRawRecord[]
	logicalNodes: readonly AnyRawRecord[]
}): TargetLDevice[] {
	const byParent = Map.groupBy(params.logicalNodes, (record) => record.parent?.id ?? '')
	return params.lDevices.map(function lDeviceOf(lDevice) {
		const held = byParent.get(lDevice.id) ?? []
		return {
			ref: { tagName: 'LDevice', id: lDevice.id },
			inst: readAttributes({ record: lDevice, defaults: 'none' }).inst ?? '',
			logicalNodes: held.map(targetLogicalNodeOf),
		}
	})
}

function targetLogicalNodeOf(record: AnyRawRecord): TargetLogicalNode {
	const attributes = readAttributes({ record, defaults: 'none' })
	return {
		ref: { tagName: record.tagName as 'LN' | 'LN0', id: record.id },
		identity: {
			prefix: attributes.prefix ?? '',
			lnClass: attributes.lnClass ?? '',
			inst: attributes.inst ?? '',
		},
		lnType: attributes.lnType ?? '',
		uuid: attributes.uuid ?? '',
	}
}

/** The LNodes asked for, each once, in the order first given. */
function uniqueLNodes(params: { lnodes: readonly Scl.Ref<'LNode'>[] }): Scl.Ref<'LNode'>[] {
	const seen = new Set<string>()
	return params.lnodes.filter(function firstTime(lnode) {
		if (seen.has(lnode.id)) return false
		seen.add(lnode.id)
		return true
	})
}

/**
 * The LNode bound to each logical node of the target IED, by the logical node's id: an LNode's truthy `lnUuid` decides
 * alone; an LNode without one is bound by its names, the IED's name first.
 */
function boundLNodesOf(params: {
	iedName: string
	lDevices: readonly TargetLDevice[]
	lnodes: readonly { record: AnyRawRecord; ancestry: readonly AnyRawRecord[] }[]
}): Map<string, SectionElement> {
	const byLnUuid = new Map<string, SectionElement>()
	const byPath = new Map<string, SectionElement>()
	for (const lnode of params.lnodes) {
		const attributes = readAttributes({ record: lnode.record, defaults: 'none' })
		const element = { record: lnode.record, ancestry: lnode.ancestry }
		if (attributes.lnUuid) byLnUuid.set(attributes.lnUuid, element)
		else if (attributes.iedName === params.iedName)
			byPath.set(
				pathKeyOf({
					ldInst: attributes.ldInst ?? '',
					prefix: attributes.prefix ?? '',
					lnClass: attributes.lnClass ?? '',
					inst: attributes.lnInst ?? '',
				}),
				element,
			)
	}
	const bound = new Map<string, SectionElement>()
	for (const lDevice of params.lDevices) {
		for (const logicalNode of lDevice.logicalNodes) {
			const lnode =
				byLnUuid.get(logicalNode.uuid) ??
				byPath.get(pathKeyOf({ ldInst: lDevice.inst, ...logicalNode.identity }))
			if (lnode) bound.set(logicalNode.ref.id, lnode)
		}
	}
	return bound
}

function pathKeyOf(params: {
	ldInst: string
	prefix: string
	lnClass: string
	inst: string
}): string {
	return [params.ldInst, params.prefix, params.lnClass, params.inst].join('/')
}

/** A function-like of the process section, not of a function template. */
function isFunctionLike(node: SectionElement): boolean {
	return (
		FUNCTION_LIKES.has(node.record.tagName) &&
		!node.ancestry.some((ancestor) => ancestor.tagName === 'FunctionTemplate')
	)
}

/** The target document's LNodeTypes, then those of the context document it lacks. */
async function readTypeCandidates(params: {
	query: Core.Query<Config>
	contextQuery: Core.Query<Config>
}): Promise<TypeCandidate[]> {
	const { query, contextQuery } = params
	const own = (await readTypesInDocumentOrder({ query })).map((record) =>
		candidateOf({ record, inTargetDocument: true }),
	)
	if (contextQuery === query) return own
	const ownIds = new Set(own.map((type) => type.id))
	const context = await readTypesInDocumentOrder({ query: contextQuery })
	return [
		...own,
		...context
			.map((record) => candidateOf({ record, inTargetDocument: false }))
			.filter((type) => !ownIds.has(type.id)),
	]
}

/** The LNodeTypes of a document in the order its DataTypeTemplates holds them. */
async function readTypesInDocumentOrder(params: {
	query: Core.Query<Config>
}): Promise<AnyRawRecord[]> {
	const { query } = params
	const types = (await query.getRecordsByTagName('LNodeType')) as AnyRawRecord[]
	const [templates] = (await query.getRecordsByTagName('DataTypeTemplates')) as AnyRawRecord[]
	const position = new Map(templates?.children.map((child, index) => [child.id, index]) ?? [])
	return types.toSorted(
		(type, other) => (position.get(type.id) ?? Infinity) - (position.get(other.id) ?? Infinity),
	)
}

function candidateOf(params: {
	record: Scl.TrackedRecord<'LNodeType'> | AnyRawRecord
	inTargetDocument: boolean
}): TypeCandidate {
	const attributes = readAttributes({ record: params.record as AnyRawRecord, defaults: 'none' })
	return {
		id: attributes.id ?? '',
		lnClass: attributes.lnClass ?? '',
		inTargetDocument: params.inTargetDocument,
	}
}
