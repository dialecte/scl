import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'

import type { VariantSelection } from './variant-selection.types'
import type { Scl } from '@/v2019C1/config'

/** The marker an element of an application carries to be added or removed when a variant is selected. */
export const VARIANT_MARKER_TAG = 'FunctionalVariantRef' satisfies Scl.ElementsOf

const [VARIANT_MARKER_PAIR] = UUID_REFERENCE_PAIRS[VARIANT_MARKER_TAG]

/** The attributes a marker names its variant by: its name, or its uuid. */
export const VARIANT_MARKER_ATTRIBUTES = VARIANT_MARKER_PAIR.attribute

/** The variants a marker can name: the members of a set of exclusive variants. */
export const VARIANT_TAGS: ReadonlySet<string> = new Set(VARIANT_MARKER_PAIR.target)

/** The elements holding a set of exclusive variants: an application, a group of variants, a variant (its sub-variants). */
export const VARIANT_SET_HOLDER_TAGS: ReadonlySet<string> = new Set(
	[...VARIANT_TAGS].flatMap(
		(tagName) => SCL_DIALECTE_CONFIG.parents[tagName as keyof typeof SCL_DIALECTE_CONFIG.parents],
	),
)

/** The reference an application composes a function by. */
export const COMPOSING_REFERENCE_TAG = 'FunctionRef' satisfies Scl.ElementsOf

/** The attribute a composing reference names its function by uuid. */
export const COMPOSING_REFERENCE_UUID =
	UUID_REFERENCE_PAIRS[COMPOSING_REFERENCE_TAG][0].attribute.uuid

/** The update of a marker removing its element with the variant it names (else `add`, the default: added with it). */
export const VARIANT_MARKER_REMOVES = 'remove'

/** An instance that selected nothing: nothing left out. */
export const NO_VARIANT_SELECTION: VariantSelection = {
	variantsNotSelected: [],
	leftOut: new Set(),
	within: new Set(),
}
