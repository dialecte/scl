import type { Scl } from '@/v2019C1/config'

/** An element a run of operations created, or updated, and the attributes the updates changed. */
export type TouchedElement = {
	ref: Scl.Ref<Scl.ElementsOf>
	/** Created by the run: every key it holds is the run's. */
	created: boolean
	/** The attributes the run's updates gave another value (names). */
	changed: Set<string>
}
