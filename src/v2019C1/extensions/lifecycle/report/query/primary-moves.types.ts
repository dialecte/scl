import type { ReportInstance } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PrimaryMove } from '@/v2019C1/extensions/lifecycle/layers/topology/resolve-primary-parents.types'

/** The report instances of a process section, and the moves of its primaries the revision makes. */
export type WithPrimaryMovesParams = {
	frameInstances: readonly ReportInstance[]
	primaryInstances: readonly ReportInstance[]
	moves: readonly PrimaryMove[]
}

/** The report instances, the moved primaries marked and linked. */
export type WithPrimaryMoves = {
	frameInstances: ReportInstance[]
	primaryInstances: ReportInstance[]
}
