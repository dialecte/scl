import type { CommitStepName } from '@/v2019C1/hooks/before-commit/commit-plan.types'

/** The keys core refuses a move's anchors with, which a move report lists instead of throwing. */
export const MOVE_ANCHOR_REFUSAL_KEYS = [
	'INVALID_PARENT_CHILD',
	'MAX_OCCURRENCES_REACHED',
	'MOVE_INTO_OWN_SUBTREE',
	'MOVE_BEFORE_NOT_SIBLING',
	'PROTECTED_ROOT',
] as const

/** The steps of the commit whose writes are the references following a move. */
export const FOLLOWING_STEPS = [
	'pathReferences',
	'tupleNames',
	'moves',
] as const satisfies readonly CommitStepName[]
