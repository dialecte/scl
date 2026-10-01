import type { Scl } from '@/v2019C1/config'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'

export type MergeChildrenResult = {
	/** Each source record that was cloned and the copy made of it. */
	cloneMappings: Scl.CloneMapping[]
	/** The source containers that landed on a container the target already holds. */
	redirectMappings: RedirectMapping[]
}
