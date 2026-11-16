import type { SpecificationIed } from './lnode-naming.types'

/** An IED of the document with its name and whether it is a specification IED (none of its own sources an ICD/IID). */
export type NamedIedKind = {
	iedId: string
	name: string
	kind: 'specification' | 'implemented'
}

/**
 * The specification IEDs of a document, as an LNode's specification is looked up: the name of each by its id, and the
 * names held by a specification IED and by no real IED (an LNode naming such a name by its names is specified on it).
 */
export type SpecificationIedIndex = {
	nameById: ReadonlyMap<string, string>
	specifiedNames: ReadonlySet<string>
}

/**
 * The logical node an LNode's `lnUuid` names, as its specification reads it: the IED holding it (none when it sits
 * outside an IED), the logical device it is in, and whether it is the document's own content (not vendor payload).
 */
export type BoundLogicalNode = {
	iedId: string | undefined
	ldInst: string | undefined
	native: boolean
	/** Its own names: `prefix`, `lnClass`, `lnInst` (the logical node's `inst`). */
	names: Readonly<Record<string, string | undefined>>
}

/**
 * An LNode as a new `LNodeSpecNaming` reads it: the specification IED it is specified on (none when on no
 * specification IED) and the names the naming is built from.
 */
export type SpecifiedLNode = {
	specificationIed: SpecificationIed | undefined
	namingAttributes: Readonly<Record<string, string | undefined>>
}
