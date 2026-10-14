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

function specifiedAttributeName(name: string): string {
	return `s${name.charAt(0).toUpperCase()}${name.slice(1)}`
}
