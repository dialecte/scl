import {
	SPECIFIED_IED_NAME_ATTRIBUTE,
	SPECIFIED_LD_INST_ATTRIBUTE,
	SPECIFIED_NAMING_ATTRIBUTES,
	UNALLOCATED_IED_NAME,
} from '@/v2019C1/constants'

import type {
	SpecificationIed,
	SpecificationLogicalNode,
	SpecifiedNaming,
} from './lnode-naming.types'

/**
 * The `LNodeSpecNaming` of an LNode that has none, from its own naming. While no IED is assigned,
 * its naming is the specified one: copied whole. Once an IED is assigned, the IED and LD names are
 * the implementation's: only the logical node part (prefix, class, instance) is kept, and the
 * naming is `derived`.
 */
export function specifiedNamingOf(
	lnodeAttributes: Readonly<Record<string, string | undefined>>,
): SpecifiedNaming {
	const derived = isAssignedToIed({ iedName: lnodeAttributes.iedName })
	const leftOut = derived ? ['iedName', 'ldInst'] : ['iedName']

	const attributes: SpecifiedNaming['attributes'] = []
	for (const [name, specifiedName] of SPECIFIED_NAMING_ATTRIBUTES) {
		const value = lnodeAttributes[name]
		if (!value || leftOut.includes(name)) continue
		attributes.push({ name: specifiedName, value })
	}
	return { attributes, derived }
}

/**
 * The `LNodeSpecNaming` of an LNode that has none ({@link specifiedNamingOf}); on a `specificationIed` (the LNode is
 * bound to it), the naming names that IED and logical device ({@link onSpecificationIed}) and is not derived.
 */
export function newSpecifiedNaming(params: {
	lnodeAttributes: Readonly<Record<string, string | undefined>>
	specificationIed: SpecificationIed | undefined
}): SpecifiedNaming {
	const { lnodeAttributes, specificationIed } = params
	const specified = specifiedNamingOf(lnodeAttributes)
	if (!specificationIed) return specified
	return {
		attributes: onSpecificationIed({ attributes: specified.attributes, specificationIed }),
		derived: false,
	}
}

/**
 * The naming an LNode gets back when no IED is assigned to it anymore: `iedName` `None`; its logical
 * device, prefix, class and instance are those of its `LNodeSpecNaming` (the class kept from the
 * LNode when the naming has none: it is required). Without an `LNodeSpecNaming`, `ldInst` is removed.
 * An attribute set to `undefined` is removed.
 */
export function unassignedNaming(params: {
	lnodeAttributes: Readonly<Record<string, string | undefined>>
	specifiedAttributes: Readonly<Record<string, string | undefined>> | undefined
}): Record<string, string | undefined> {
	const { lnodeAttributes, specifiedAttributes } = params
	const naming: Record<string, string | undefined> = { iedName: UNALLOCATED_IED_NAME }
	if (!specifiedAttributes) return { ...naming, ldInst: undefined }
	for (const [name, specifiedName] of SPECIFIED_NAMING_ATTRIBUTES) {
		if (name in naming) continue
		const specified = specifiedAttributes[specifiedName] || undefined
		naming[name] = name === 'lnClass' ? (specified ?? lnodeAttributes.lnClass) : specified
	}
	return naming
}

/** Whether an LNode named `iedName` is assigned to an IED: the name is set and is not `None`. */
export function isAssignedToIed(params: { iedName: string | undefined }): boolean {
	const { iedName } = params
	return Boolean(iedName) && iedName !== UNALLOCATED_IED_NAME
}

/**
 * A specified naming set on a specification IED: the IED and the logical device are that IED's (`sLdInst` removed
 * when it names none), the logical node part is left as specified.
 */
export function onSpecificationIed(params: {
	attributes: readonly { name: string; value: string }[]
	specificationIed: SpecificationIed
}): { name: string; value: string }[] {
	const { attributes, specificationIed } = params
	const kept = attributes.filter(
		(attribute) =>
			attribute.name !== SPECIFIED_IED_NAME_ATTRIBUTE &&
			attribute.name !== SPECIFIED_LD_INST_ATTRIBUTE,
	)
	const written = [{ name: SPECIFIED_IED_NAME_ATTRIBUTE, value: specificationIed.iedName }]
	if (specificationIed.ldInst)
		written.push({ name: SPECIFIED_LD_INST_ATTRIBUTE, value: specificationIed.ldInst })
	return [...kept, ...written]
}

/**
 * The naming an LNode gets back when its binding is released (an attribute set to `undefined` is removed). Specified
 * on a specification IED other than the one it is released from, and that IED holding the logical node its specified
 * naming names (`specificationLogicalNode`): bound to that logical node, named by its specified naming. Otherwise
 * assigned to no IED ({@link unassignedNaming}). The specified naming itself is never rewritten.
 */
export function releasedNaming(params: {
	lnodeAttributes: Readonly<Record<string, string | undefined>>
	specifiedAttributes: Readonly<Record<string, string | undefined>> | undefined
	specificationLogicalNode: SpecificationLogicalNode | undefined
}): Record<string, string | undefined> {
	const { lnodeAttributes, specifiedAttributes, specificationLogicalNode } = params
	const specifiedIedName = specifiedAttributes?.[SPECIFIED_IED_NAME_ATTRIBUTE]
	const releasedFromSpecificationIed =
		isAssignedToIed({ iedName: lnodeAttributes.iedName }) &&
		lnodeAttributes.iedName === specifiedIedName
	if (specifiedAttributes && specificationLogicalNode && !releasedFromSpecificationIed) {
		const naming: Record<string, string | undefined> = {}
		for (const [name, specifiedName] of SPECIFIED_NAMING_ATTRIBUTES) {
			naming[name] = specifiedAttributes[specifiedName] || undefined
		}
		naming.lnClass ??= lnodeAttributes.lnClass
		return { ...naming, lnUuid: specificationLogicalNode.uuid }
	}
	return { ...unassignedNaming({ lnodeAttributes, specifiedAttributes }), lnUuid: undefined }
}
