import { UUID_REFERENCE_PAIRS, RESOLUTION_TYPE } from './reference'

export type UuidReferencePairs = typeof UUID_REFERENCE_PAIRS
export type ReferencePair = (typeof UUID_REFERENCE_PAIRS)[keyof typeof UUID_REFERENCE_PAIRS][number]
export type ResolutionType = (typeof RESOLUTION_TYPE)[keyof typeof RESOLUTION_TYPE]

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
