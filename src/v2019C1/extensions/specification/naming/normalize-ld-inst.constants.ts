import { DEFINITION } from '@/v2019C1/definition'

/** A run of characters a logical device inst cannot hold. */
export const NOT_IN_LD_INST = /[^0-9A-Za-z_]+/g

/** A run of underscores. */
export const UNDERSCORE_RUN = /_+/g

/** Leading underscores. */
export const LEADING_UNDERSCORES = /^_+/

/** What joins a level's name to the name it disambiguates. */
export const LEVEL_SEPARATOR = '_'

const LD_INST_FACETS = DEFINITION.LDevice.attributes.details.inst.type.facets
const LN_PREFIX_FACETS = DEFINITION.LN.attributes.details.prefix.type.facets
const LN_INST_FACETS = DEFINITION.LN.attributes.details.inst.type.facets

/** The logical device inst pattern, from the definition. */
export const LD_INST_PATTERN = new RegExp(`^(?:${LD_INST_FACETS.pattern[0].join('|')})$`)

/** The logical node prefix pattern (a non-empty prefix), from the definition. */
export const LN_PREFIX_PATTERN = new RegExp(
	`^(?:${LN_PREFIX_FACETS.pattern[0].filter((pattern) => pattern !== '').join('|')})$`,
)

/** The longest logical node prefix, from the definition. */
export const LN_PREFIX_MAX = LN_PREFIX_FACETS.maxLength

/** The logical node inst pattern, from the definition. */
export const LN_INST_PATTERN = new RegExp(`^(?:${LN_INST_FACETS.pattern[0].join('|')})$`)
