import type { AnyRawRecord } from '@dialecte/core'

/**
 * The names of signals counted per frozen list of siblings (the import's, one per parent): a list that cannot change is
 * counted once for every signal named among it.
 */
export const NAMES_AMONG = new WeakMap<readonly AnyRawRecord[], Map<string, number>>()
