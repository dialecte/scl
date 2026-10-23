import type { WriteIdentityParams } from '@/v2019C1/extensions/identity/transaction'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'

export type FinalizeClonedIdentityParams = WriteIdentityParams & {
	/**
	 * Source elements mapped onto elements the target already holds (nothing cloned for them): references to them are
	 * repointed, but no lineage is written on the target element — it is the target's own, not an instance of the
	 * source.
	 */
	redirectMappings?: readonly RedirectMapping[]
}
