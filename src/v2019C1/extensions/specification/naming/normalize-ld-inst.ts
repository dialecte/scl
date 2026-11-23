import {
	LEADING_UNDERSCORES,
	LEVEL_SEPARATOR,
	NOT_IN_LD_INST,
	UNDERSCORE_RUN,
} from './normalize-ld-inst.constants'

/**
 * A name as a logical device inst (or a prefix): every run of characters other than letters, digits and `_` becomes
 * one `_`, runs of `_` collapse, leading `_` go. Empty when nothing is left.
 */
export function normalizeLdInst(params: { name: string }): string {
	return params.name
		.replace(NOT_IN_LD_INST, '_')
		.replace(UNDERSCORE_RUN, '_')
		.replace(LEADING_UNDERSCORES, '')
}

/** A name prefixed with the name of the level above it, normalised. */
export function prefixWithLevel(params: { level: string; name: string }): string {
	return normalizeLdInst({ name: `${params.level}${LEVEL_SEPARATOR}${params.name}` })
}
