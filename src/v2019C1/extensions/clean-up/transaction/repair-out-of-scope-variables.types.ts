import type { OutOfScopeVariable } from '@/v2019C1/extensions/clean-up/query/out-of-scope-variables.types'

/**
 * What `repairOutOfScopeVariables` did: the variables given their counterpart, those whose reference it cleared, and
 * those it left as they are because they hold both reference groups (their groups are the caller's to settle first).
 */
export type RepairedVariables = {
	rescoped: OutOfScopeVariable[]
	cleared: OutOfScopeVariable[]
	left: OutOfScopeVariable[]
}
