import type { ProvenanceAnchorKind } from './get-provenance.types'

/**
 * Maps the tag of an anchoring element to its provenance kind. The nearest
 * ancestor of a source-file reference that matches one of these tags is the
 * element the reference belongs to.
 */
export const PROVENANCE_ANCHOR_KIND_BY_TAG: Partial<Record<string, ProvenanceAnchorKind>> = {
	Application: 'application',
	Function: 'function',
	SubFunction: 'function',
	EqFunction: 'function',
	EqSubFunction: 'function',
	IED: 'ied',
	Header: 'document',
}
