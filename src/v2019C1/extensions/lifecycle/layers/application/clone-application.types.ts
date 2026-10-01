import type { Scl } from '@/v2019C1/config'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'

export type CloneApplicationContentResult = {
	/** All source -> target clone mappings for the application content. */
	mappings: Scl.CloneMapping[]
	/** Shared elements mapped onto elements the target already holds (nothing cloned for them). */
	redirectMappings: RedirectMapping[]
}
