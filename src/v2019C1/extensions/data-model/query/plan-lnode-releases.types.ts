import type * as Core from '@dialecte/core'

export type PlanLNodeReleasesParams = {
	/** The LNodes to release, as they stand (a pending write included). */
	lnodes: readonly Core.AnyRawRecord[]
}

/** The attributes each LNode released gets, by LNode id; `undefined` removes one. */
export type LNodeReleasePlan = Map<string, Record<string, string | undefined>>
