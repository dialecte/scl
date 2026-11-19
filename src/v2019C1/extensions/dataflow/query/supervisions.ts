import {
	IED_RELATIVE_REFERENCE_PREFIX,
	SUPERVISION_BY_CONTROL_BLOCK,
	SUPERVISION_KINDS,
	SUPERVISION_LN_TAG,
	SUPERVISION_REFERENCE_ATTRIBUTE,
	UUID_REFERENCE_PREFIX,
} from '../constants/supervision.constants'

import { readAttribute } from '@/v2019C1/helpers'

import type { Supervision } from '../dataflow.types'
import type { DataflowContext } from './dataflow-context.types'
import type { ControlBlockNode, IedNode } from './ied-section.types'
import type { IndexedSupervision, SupervisionIndex, SupervisionKind } from './supervisions.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Reads the supervisions of the document once: the LGOS / LSVS logical nodes the IED section holds,
 * then their supervising data objects, those data objects' `setSrcRef` and its values, one read per
 * level whatever their number (none when the document holds no LGOS / LSVS).
 */
export async function readSupervisionIndex(params: {
	context: DataflowContext
}): Promise<SupervisionIndex> {
	const { context } = params
	const { query } = context
	const { logicalNodes } = await context.iedSection()
	const supervising = logicalNodes.flatMap((node) => {
		const kind = supervisionKindOf(node)
		return kind ? [{ node, kind }] : []
	})
	const index = new Map<string, IndexedSupervision>()
	if (supervising.length === 0) return index

	const dataObjects = await namedChildrenOfEach({
		query,
		parents: supervising.map(({ node, kind }) => ({ record: node.record, name: kind.dataObject })),
		tagName: 'DOI',
	})
	const references = await namedChildrenOfEach({
		query,
		parents: dataObjects.map(({ child }) => ({
			record: child,
			name: SUPERVISION_REFERENCE_ATTRIBUTE,
		})),
		tagName: 'DAI',
	})
	const valuesOfEach =
		references.length > 0
			? await query.any.getChildrenOfEach(
					references.map(({ child }) => child),
					{ tagName: 'Val' },
				)
			: []

	let position = 0
	for (let referenceIndex = 0; referenceIndex < references.length; referenceIndex++) {
		const reference = references[referenceIndex]
		const dataObject = dataObjects[reference.parent]
		const { node, kind } = supervising[dataObject.parent]
		for (const value of valuesOfEach[referenceIndex] ?? []) {
			const key = supervisionKey({
				iedId: node.ied.id,
				lnClass: kind.lnClass,
				value: value.value ?? '',
			})
			if (!index.has(key)) {
				index.set(key, {
					supervision: {
						ln: { tagName: 'LN', id: node.record.id },
						doi: { tagName: 'DOI', id: dataObject.child.id },
						dai: { tagName: 'DAI', id: reference.child.id },
						val: { tagName: 'Val', id: value.id },
					},
					position,
				})
			}
			position++
		}
	}
	return index
}

/**
 * The supervision of a control block in a subscriber IED: the first (in document order) of the
 * index's supervisions whose value names the control block in one of its reference forms;
 * `undefined` for a control block that is not supervised (a report control block) or no match.
 */
export function supervisionOf(params: {
	index: SupervisionIndex
	controlBlock: ControlBlockNode
	subscriber: Scl.Ref<'IED'>
}): Supervision | undefined {
	const { index, controlBlock, subscriber } = params
	const kind =
		SUPERVISION_BY_CONTROL_BLOCK[
			controlBlock.record.tagName as keyof typeof SUPERVISION_BY_CONTROL_BLOCK
		]
	if (!kind) return undefined
	const found = referenceFormsOf({ controlBlock, subscriber }).flatMap((value) => {
		const indexed = index.get(
			supervisionKey({ iedId: subscriber.id, lnClass: kind.lnClass, value }),
		)
		return indexed ? [indexed] : []
	})
	return found.sort((first, second) => first.position - second.position)[0]?.supervision
}

/**
 * The forms a reference to the control block takes inside SCL: by the logical device name when it
 * has one (`<ldName>/LLN0.<name>`), by its default name (`<IED name><inst>/LLN0.<name>`, the form
 * files carry even beside an `ldName`), relative inside its own IED (`@<inst>/LLN0.<name>`) and by
 * its uuid (`#UID<uuid>`).
 */
function referenceFormsOf(params: {
	controlBlock: ControlBlockNode
	subscriber: Scl.Ref<'IED'>
}): string[] {
	const { controlBlock, subscriber } = params
	const { record, ancestry } = controlBlock
	const name = attributeOf({ record, name: 'name' })
	const uuid = attributeOf({ record, name: 'uuid' })
	const ied = ancestry.find((ancestor) => ancestor.tagName === 'IED')
	const ldevice = ancestry.findLast((ancestor) => ancestor.tagName === 'LDevice')
	const ln0 = ancestry.findLast((ancestor) => ancestor.tagName === 'LN0')
	const forms: string[] = uuid ? [`${UUID_REFERENCE_PREFIX}${uuid}`] : []
	if (!name || !ldevice || !ln0 || !ied) return forms

	const iedName = attributeOf({ record: ied, name: 'name' }) ?? ''
	const inst = attributeOf({ record: ldevice, name: 'inst' }) ?? ''
	const ldName = attributeOf({ record: ldevice, name: 'ldName' })
	const lnName = attributeOf({ record: ln0, name: 'lnClass' }) ?? ''
	const objectPath = `/${lnName}.${name}`
	if (ldName) forms.push(`${ldName}${objectPath}`)
	forms.push(`${iedName}${inst}${objectPath}`)
	if (controlBlock.ied.id === subscriber.id) {
		forms.push(`${IED_RELATIVE_REFERENCE_PREFIX}${inst}${objectPath}`)
	}
	return forms
}

/** How a logical node supervises a control block, when it is an `LN` of a supervising class. */
function supervisionKindOf(node: IedNode<'LN' | 'LN0'>): SupervisionKind | undefined {
	if (node.record.tagName !== SUPERVISION_LN_TAG) return undefined
	const lnClass = attributeOf({ record: node.record, name: 'lnClass' })
	return SUPERVISION_KINDS.find((kind) => kind.lnClass === lnClass)
}

/**
 * The children of the tag of each parent whose `name` is the one given, with the position of their
 * parent, in document order: one store read for every parent. Not `readSignalChildrenOfEach`: that
 * one reads the signal tags of parents given by ref; this one keeps the children of one tag by name.
 */
async function namedChildrenOfEach(params: {
	query: Core.Query<Config>
	parents: readonly { record: Core.AnyRawRecord; name: string }[]
	tagName: 'DOI' | 'DAI'
}): Promise<{ parent: number; child: Core.AnyTrackedRecord }[]> {
	const { query, parents, tagName } = params
	if (parents.length === 0) return []
	const childrenOfEach = await query.any.getChildrenOfEach(
		parents.map(({ record }) => record),
		{ tagName },
	)
	return parents.flatMap(({ name }, parent) =>
		(childrenOfEach[parent] ?? [])
			.filter((child) => attributeOf({ record: child, name: 'name' }) === name)
			.map((child) => ({ parent, child })),
	)
}

/** The attribute of a record as written, `undefined` when absent or empty. */
function attributeOf(params: { record: Core.AnyRawRecord; name: string }): string | undefined {
	return readAttribute({ ...params, defaults: 'none' }) || undefined
}

/** The key of a supervision in the index. */
function supervisionKey(params: { iedId: string; lnClass: string; value: string }): string {
	const { iedId, lnClass, value } = params
	return JSON.stringify([iedId, lnClass, value])
}
