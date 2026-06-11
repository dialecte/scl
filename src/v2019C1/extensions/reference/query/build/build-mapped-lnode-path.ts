/**
 * Composes the canonical IED-section path of the `LN` that implements a mapped
 * `LNode`, from the LNode's implementation attributes
 * (`iedName`, `ldInst`, `prefix`, `lnClass`, `lnInst`).
 *
 * A mapped `LNode` carries the identity of the IED
 * `LN` that implements it. An unmapped `LNode` uses `iedName="None"` and has no
 * implementing `LN`.
 *
 * @example
 * buildMappedLNodePath({ iedName: 'IED1', ldInst: 'LD0', prefix: '', lnClass: 'XCBR', lnInst: '1' })
 * // → "IED1/LD0/XCBR1"
 */
export function buildMappedLNodePath(attrs: MappedLNodeAttributes): string | null {
	const iedName = attrs.iedName
	if (!iedName || iedName === UNMAPPED_IED_NAME) return null

	const ldInst = attrs.ldInst
	const lnClass = attrs.lnClass
	if (!ldInst || !lnClass) return null

	const lnSegment = `${attrs.prefix ?? ''}${lnClass}${attrs.lnInst ?? ''}`
	return `${iedName}/${ldInst}/${lnSegment}`
}

export type MappedLNodeAttributes = {
	iedName?: string
	ldInst?: string
	prefix?: string
	lnClass?: string
	lnInst?: string
}

const UNMAPPED_IED_NAME = 'None'
