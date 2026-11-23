import { readDataTypeRecords } from '@/v2019C1/extensions/data-model/query/read-data-type-records'
import { readAttributes } from '@/v2019C1/helpers'

import type { ValuePath } from '../transaction/build-ied.types'
import type {
	HeldValue,
	SectionElement,
	SpecifiedValue,
	TypeCandidate,
	ValueTypes,
} from './build-input.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The values the LNodes specify, by LNode id: every DAS holding a `Val`, with the DOS and SDS above it up to its
 * LNode, read from the process section already read (no store read).
 */
export function specifiedValuesOf(params: {
	nodes: readonly SectionElement[]
	lnodeIds: ReadonlySet<string>
}): Map<string, SpecifiedValue[]> {
	const { nodes, lnodeIds } = params
	const valsOf = Map.groupBy(
		nodes.filter((node) => node.record.tagName === 'Val'),
		(node) => node.ancestry.at(-1)?.id ?? '',
	)
	const specified = new Map<string, SpecifiedValue[]>()
	for (const node of nodes) {
		if (node.record.tagName !== 'DAS') continue
		const lnodeLevel = node.ancestry.findLastIndex((ancestor) => ancestor.tagName === 'LNode')
		const lnode = node.ancestry[lnodeLevel]
		if (!lnode || !lnodeIds.has(lnode.id)) continue
		const vals = (valsOf.get(node.record.id) ?? []).map((val) => valOf({ record: val.record }))
		if (vals.length === 0) continue
		const path = pathOf({ steps: [...node.ancestry.slice(lnodeLevel + 1), node.record] })
		if (!path) continue
		const attributes = readAttributes({ record: node.record, defaults: 'none' })
		const value: SpecifiedValue = {
			das: { tagName: 'DAS', id: node.record.id },
			path,
			vals,
			...(attributes.valKind && { valKind: attributes.valKind }),
			...(attributes.valImport && { valImport: attributes.valImport }),
		}
		const ofLNode = specified.get(lnode.id)
		if (ofLNode) ofLNode.push(value)
		else specified.set(lnode.id, [value])
	}
	return specified
}

/**
 * The values the logical nodes given already hold, by logical node id: one read of their DOI, SDI, DAI and `Val`
 * descendants for all of them; none read when no logical node is given.
 */
export async function readHeldValues(
	query: Core.Query<Config>,
	params: { logicalNodes: readonly Scl.Ref<'LN' | 'LN0'>[] },
): Promise<Map<string, HeldValue[]>> {
	const { logicalNodes } = params
	const held = new Map<string, HeldValue[]>()
	if (logicalNodes.length === 0) return held
	const descendants = await query.findDescendantsOfEach(
		logicalNodes as Scl.Ref<'LN'>[],
		{ collect: ['DOI', 'SDI', 'DAI', 'Val'] } as never,
	)
	logicalNodes.forEach(function heldBy(logicalNode, position) {
		const groups = (descendants[position] ?? {}) as Record<string, AnyRawRecord[]>
		const byId = new Map(
			Object.values(groups)
				.flat()
				.map((record) => [record.id, record]),
		)
		held.set(logicalNode.id, heldValuesBelow({ byId, roots: [...byId.values()] }))
	})
	return held
}

/**
 * The data types of every LNodeType of the classes given, from the document built in and from the context document
 * for the types only it holds; nothing read when no value is specified.
 */
export async function readValueTypes(params: {
	query: Core.Query<Config>
	contextQuery: Core.Query<Config>
	types: readonly TypeCandidate[]
	lnClasses: ReadonlySet<string>
}): Promise<ValueTypes> {
	const { query, contextQuery, types, lnClasses } = params
	if (lnClasses.size === 0) return {}
	const ofClasses = types.filter((type) => lnClasses.has(type.lnClass))
	const own = ofClasses.filter((type) => type.inTargetDocument).map((type) => type.id)
	const context = ofClasses.filter((type) => !type.inTargetDocument).map((type) => type.id)
	const target = await readDataTypeRecords({ query, lnTypes: own })
	if (context.length === 0 || contextQuery === query) return { target }
	return { target, context: await readDataTypeRecords({ query: contextQuery, lnTypes: context }) }
}

/** The DAIs among the records with their values, each with its path from its DOI. */
function heldValuesBelow(params: {
	byId: ReadonlyMap<string, AnyRawRecord>
	roots: readonly AnyRawRecord[]
}): HeldValue[] {
	const { byId } = params
	return params.roots.flatMap(function heldOf(record): HeldValue[] {
		if (record.tagName !== 'DAI') return []
		const steps: AnyRawRecord[] = [record]
		let parent = record.parent && byId.get(record.parent.id)
		while (parent) {
			steps.unshift(parent)
			parent = parent.parent ? byId.get(parent.parent.id) : undefined
		}
		const path = pathOf({ steps })
		if (!path) return []
		const attributes = readAttributes({ record, defaults: 'none' })
		return [
			{
				dai: { tagName: 'DAI', id: record.id },
				path,
				vals: record.children.flatMap((child) => {
					const val = byId.get(child.id)
					return val && val.tagName === 'Val' ? [valOf({ record: val })] : []
				}),
				...(attributes.valKind && { valKind: attributes.valKind }),
				...(attributes.valImport && { valImport: attributes.valImport }),
			},
		]
	})
}

/** The path of the steps from the DOS (or DOI) down to the DAS (or DAI); none when the steps make no such path. */
function pathOf(params: { steps: readonly AnyRawRecord[] }): ValuePath | undefined {
	const named = params.steps.map(function nameOf(step) {
		const { name, ix } = readAttributes({ record: step, defaults: 'none' })
		return { name: name ?? '', ...(ix && { ix }) }
	})
	const [first, ...rest] = named
	const last = rest.at(-1)
	if (!first || !last) return undefined
	return { doi: first.name, sdi: rest.slice(0, -1), dai: last }
}

function valOf(params: { record: AnyRawRecord }): { value: string; sGroup?: string } {
	const { sGroup } = readAttributes({ record: params.record, defaults: 'none' })
	return { value: params.record.value, ...(sGroup && { sGroup }) }
}
