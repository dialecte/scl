import { SPECIFIED_NAMING_ATTRIBUTES, UNALLOCATED_IED_NAME } from '@/v2019C1/constants'

import type { SpecifiedNaming } from './lnode-naming.types'

/**
 * The `LNodeSpecNaming` of an LNode that has none, from its own naming. While no IED is assigned,
 * its naming is the specified one: copied whole. Once an IED is assigned, the IED and LD names are
 * the implementation's: only the logical node part (prefix, class, instance) is kept, and the
 * naming is `derived`.
 */
export function specifiedNamingOf(
	lnodeAttributes: Readonly<Record<string, string>>,
): SpecifiedNaming {
	const iedName = lnodeAttributes.iedName
	const derived = Boolean(iedName) && iedName !== UNALLOCATED_IED_NAME
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
 * The naming an LNode gets back when no IED is assigned to it anymore: `iedName` `None`, no
 * `ldInst`; its prefix, class and instance those of its `LNodeSpecNaming` when it has one (the class
 * kept from the LNode when the naming has none: it is required). An attribute set to `undefined` is
 * removed.
 */
export function unassignedNaming(params: {
	lnodeAttributes: Readonly<Record<string, string | undefined>>
	specifiedAttributes: Readonly<Record<string, string | undefined>> | undefined
}): Record<string, string | undefined> {
	const { lnodeAttributes, specifiedAttributes } = params
	const naming: Record<string, string | undefined> = {
		iedName: UNALLOCATED_IED_NAME,
		ldInst: undefined,
	}
	if (!specifiedAttributes) return naming
	for (const [name, specifiedName] of SPECIFIED_NAMING_ATTRIBUTES) {
		if (name in naming) continue
		const specified = specifiedAttributes[specifiedName] || undefined
		naming[name] = name === 'lnClass' ? (specified ?? lnodeAttributes.lnClass) : specified
	}
	return naming
}
