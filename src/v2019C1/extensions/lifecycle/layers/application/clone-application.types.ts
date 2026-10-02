import type { Scl } from '@/v2019C1/config'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'

export type CloneApplicationContentResult = {
	/** All source -> target clone mappings for the application content. */
	cloneMappings: Scl.CloneMapping[]
	/** Shared elements mapped onto elements the target already holds (nothing cloned for them). */
	redirectMappings: RedirectMapping[]
}

/** A source AllocationRole that landed on a role the target already holds. */
export type AllocationRoleReuse = {
	sourceId: string
	sourceUuid: string
	existingRef: Scl.Ref<'AllocationRole'>
	/** The source role's children cloned under the existing role. */
	contributedMappings: Scl.CloneMapping[]
}
