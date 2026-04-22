import { UUID_REFERENCE_PAIRS, RESOLUTION_TYPE } from './pairs'

export type UuidReferencePairs = typeof UUID_REFERENCE_PAIRS
export type ReferencePair = (typeof UUID_REFERENCE_PAIRS)[keyof typeof UUID_REFERENCE_PAIRS][number]
export type ResolutionType = (typeof RESOLUTION_TYPE)[keyof typeof RESOLUTION_TYPE]

/** All SCL elements that have UUID reference pairs. */
export type RefTagName = keyof typeof UUID_REFERENCE_PAIRS

/** Valid target tag names for a given ref tag. */
export type TargetOf<Ref extends RefTagName> =
	(typeof UUID_REFERENCE_PAIRS)[Ref][number]['target'][number]

export type RefEntry = {
	refTagName: string
	uuidAttr: string
	pathAttr: string
}

export type RefPairEntry = {
	uuidAttr: string
	pathAttr: string
	resolution: string
	targetTagNames: readonly string[]
}
