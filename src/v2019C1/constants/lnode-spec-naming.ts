import { ATTRIBUTES, DEFINITION } from '@/v2019C1/definition'

/** The attributes naming an LNode (`iedName`, `ldInst`, `prefix`, `lnClass`, `lnInst`). */
export const LNODE_NAMING_ATTRIBUTES: readonly string[] =
	(DEFINITION as Record<string, { attributes?: { identityFields?: readonly string[] } }>).LNode
		?.attributes?.identityFields ?? []

/**
 * Each attribute naming an LNode and the attribute of its `LNodeSpecNaming` keeping the specified
 * value (`lnClass` -> `sLnClass`).
 */
export const SPECIFIED_NAMING_ATTRIBUTES: ReadonlyMap<string, string> = new Map(
	LNODE_NAMING_ATTRIBUTES.map((name): [string, string] => [
		name,
		specifiedAttributeName(name),
	]).filter(([, specified]) => specified in ATTRIBUTES.byTag.LNodeSpecNaming),
)

/** The attribute of an `LNodeSpecNaming` naming the specification IED the LNode is specified on. */
export const SPECIFIED_IED_NAME_ATTRIBUTE: string = specifiedAttributeName('iedName')

/** The attribute of an `LNodeSpecNaming` naming the logical device the LNode is specified in. */
export const SPECIFIED_LD_INST_ATTRIBUTE: string = specifiedAttributeName('ldInst')

function specifiedAttributeName(name: string): string {
	return `s${name.charAt(0).toUpperCase()}${name.slice(1)}`
}
