import type { Scl } from '@/v2019C1/config'
import type { InstanceDiff } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

/** The report of one application instance, and what its roles refer to that its first placement does not place. */
export type ReportedApplicationInstance = {
	instanceDiff: InstanceDiff
	satellitesNotPlaced: Scl.Ref<Scl.ElementsOf>[]
}
