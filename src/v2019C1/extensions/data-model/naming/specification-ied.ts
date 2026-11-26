import { isAssignedToIed } from './lnode-naming'

import { isNativeNode } from '@/v2019C1/extensions/reference/query/find/is-native-node'
import { readAttributes } from '@/v2019C1/helpers'
import { isOwnTransparentElement } from '@/v2019C1/helpers/transparent-elements'

import type { SpecificationIed } from './lnode-naming.types'
import type {
	BoundLogicalNode,
	NamedIedKind,
	SpecificationIedIndex,
	SpecifiedLNode,
} from './specification-ied.types'
import type { AnyRawRecord } from '@dialecte/core'

/** The specification IEDs of the kinds given, indexed for {@link specificationIedOf}. */
export function specificationIedIndex(params: {
	kinds: readonly NamedIedKind[]
}): SpecificationIedIndex {
	const { kinds } = params
	const nameById = new Map(
		kinds.flatMap(({ iedId, name, kind }) =>
			kind === 'specification' ? [[iedId, name] as const] : [],
		),
	)
	const realNames = new Set(
		kinds.flatMap(({ name, kind }) => (kind === 'implemented' ? [name] : [])),
	)
	const specifiedNames = new Set([...nameById.values()].filter((name) => !realNames.has(name)))
	return { nameById, specifiedNames }
}

/**
 * The specification IED an LNode is specified on, with the logical device it names there. An LNode whose `lnUuid`
 * names a logical node is specified on the specification IED holding it, its logical device that logical node's,
 * whatever names the LNode carries: the uuid wins. One naming no logical node by uuid is specified on the
 * specification IED its `iedName` names (held by no real IED), its logical device its own `ldInst`. `undefined` for
 * any other.
 */
export function specificationIedOf(params: {
	lnodeAttributes: Readonly<Record<string, string | undefined>>
	boundLogicalNode: BoundLogicalNode | undefined
	index: SpecificationIedIndex
}): SpecificationIed | undefined {
	const { lnodeAttributes, boundLogicalNode, index } = params
	if (boundLogicalNode) {
		const { iedId, ldInst, native } = boundLogicalNode
		const iedName = iedId === undefined ? undefined : index.nameById.get(iedId)
		return iedName && native ? { iedName, ldInst } : undefined
	}
	const { iedName, ldInst } = lnodeAttributes
	if (!iedName || !isAssignedToIed({ iedName }) || !index.specifiedNames.has(iedName))
		return undefined
	return { iedName, ldInst }
}

/**
 * An LNode as a new `LNodeSpecNaming` reads it: its specification IED ({@link specificationIedOf}) and the names the
 * naming is built from. Specified on a specification IED by its `lnUuid`, the names are those of the logical node it
 * names (the LNode's own once its names follow its uuid); any other LNode, its own names as they are.
 */
export function specifiedLNodeOf(params: {
	lnodeAttributes: Readonly<Record<string, string | undefined>>
	boundLogicalNode: BoundLogicalNode | undefined
	index: SpecificationIedIndex
}): SpecifiedLNode {
	const { lnodeAttributes, boundLogicalNode } = params
	const specificationIed = specificationIedOf(params)
	if (!specificationIed || !boundLogicalNode)
		return { specificationIed, namingAttributes: lnodeAttributes }
	return {
		specificationIed,
		namingAttributes: {
			...lnodeAttributes,
			iedName: specificationIed.iedName,
			ldInst: specificationIed.ldInst,
			...boundLogicalNode.names,
		},
	}
}

/**
 * A logical node read with the records above it (from the root or from its IED down), as {@link specificationIedOf}
 * reads it: the IED above it, its logical device, and whether the chain from its IED down is native (a logical node
 * in a `Private` is vendor payload, whatever the records above it).
 */
export function boundLogicalNodeOf(params: {
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
}): BoundLogicalNode {
	const { record, ancestry } = params
	const iedIndex = ancestry.findIndex((ancestor) => ancestor.tagName === 'IED')
	const fromIed = iedIndex === -1 ? ancestry : ancestry.slice(iedIndex)
	const ied = iedIndex === -1 ? undefined : ancestry[iedIndex]
	const lDevice = fromIed.findLast((ancestor) => ancestor.tagName === 'LDevice')
	const { prefix, lnClass, inst } = readAttributes({ record, defaults: 'none' })
	return {
		names: { prefix, lnClass, lnInst: inst },
		iedId: ied?.id,
		ldInst: lDevice && readAttributes({ record: lDevice, defaults: 'none' }).inst,
		// a read lifts an SCL Private's children into the element holding it: the check reads the ancestry that way; a
		// vendor's Private of another namespace stays in it, as core reads the chain
		native: isNativeNode({
			record,
			ancestry: fromIed.filter(function isNotWrapper(ancestor) {
				return !isOwnTransparentElement({ record: ancestor })
			}),
		}),
	}
}
