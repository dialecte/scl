import type { Config, Scl } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'
import type * as Core from '@dialecte/core'

export type AssertIedPlacementParams = {
	sourceQuery: Core.Query<Config>
	/** The IED of the source file to place. */
	iedRef: Scl.Ref<'IED'>
	scenario: LifecycleScenario
	/** The type of file the source is, from its extension. */
	fileType: SclFileType | undefined
	/** The operation refusing, named in the error's detail. */
	operation: 'report (ied)' | 'instantiate (ied)'
}
