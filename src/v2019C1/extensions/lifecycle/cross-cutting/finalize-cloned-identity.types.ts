import type { Scl } from '@/v2019C1/config'
import type { WriteIdentityParams } from '@/v2019C1/extensions/identity/transaction'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'

export type FinalizeClonedIdentityParams = (
	| WriteIdentityParams
	| {
			/**
			 * A copy: the lineage as the clone copied it (a copy of an instance is another instance of its template), every
			 * element a uuid of its own, the references inside repointed onto the copy.
			 */
			mode: 'copy'
			cloneMappings: readonly Scl.CloneMapping[]
	  }
) & {
	/**
	 * Source elements mapped onto elements the target already holds (nothing cloned for them): references to them are
	 * repointed, but no lineage is written on the target element — it is the target's own, not an instance of the
	 * source.
	 */
	redirectMappings?: readonly RedirectMapping[]
}
