import type { Scl } from '@/v2019C1/config'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'

export type ReconcileCrossCuttingSatellitesResult = {
	/** Each source record the reconcile added and the copy made of it. */
	cloneMappings: Scl.CloneMapping[]
	/** The source satellites that stand for an element the project already holds. */
	redirectMappings: RedirectMapping[]
}
