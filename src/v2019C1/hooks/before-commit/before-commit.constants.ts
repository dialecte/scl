import type { StepWrites } from './commit-plan.types'

/** The writes a step that reads none of the steps before it is given. */
export const NO_WRITES: StepWrites = { pending: new Map(), gone: new Set() }
