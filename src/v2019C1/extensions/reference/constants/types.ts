import { RESOLUTION_TYPE } from './resolution-types'
import { TYPE_ID_REFERENCE_PAIRS } from './type-id-pairs'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'

import type { Scl } from '@/v2019C1/config'

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

// ── Type-id references (DataTypeTemplates linkage) ──────────────────────────────

export type TypeIdTarget = 'LNodeType' | 'DOType' | 'DAType' | 'EnumType'

export type TypeIdReferencePair = {
	/** Attribute on the referrer that holds the target type id. */
	attribute: string
	/** Target type tag the id resolves to. */
	target: TypeIdTarget
	/**
	 * Optional discriminator (e.g. DA/BDA route to EnumType vs DAType by `bType`).
	 * When present, the pair only applies if the referrer's `attribute` equals `equals`.
	 */
	when?: { attribute: string; equals: string }
}

/**
 * Authoring shape for {@link TYPE_ID_REFERENCE_PAIRS}: keyed by the referrer
 * element tag, it constrains `attribute` (and `when.attribute`) to real
 * attributes of that element — so a typo or wrong attribute fails to compile.
 */
export type TypeIdReferencePairsShape = {
	[Tag in Scl.ElementsOf]?: readonly {
		attribute: Scl.AttributesOf<Tag>
		target: TypeIdTarget
		when?: { attribute: Scl.AttributesOf<Tag>; equals: string }
	}[]
}

export type TypeIdReferencePairs = typeof TYPE_ID_REFERENCE_PAIRS

export type TypeIdRefTagName = keyof typeof TYPE_ID_REFERENCE_PAIRS

/** The attribute names that can carry a type id (derived from the registry). */
export type TypeIdRefAttribute =
	(typeof TYPE_ID_REFERENCE_PAIRS)[TypeIdRefTagName][number]['attribute']

export type TypeIdReferrer = {
	refTagName: TypeIdRefTagName
	attribute: TypeIdRefAttribute
	when?: { attribute: string; equals: string }
}
