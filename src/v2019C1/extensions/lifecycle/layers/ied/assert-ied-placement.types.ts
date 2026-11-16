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

/** The project's element holding a uuid an IED placement keeps, as a refusal tells it. */
export type HeldElement = {
	tagName: string
	/** Its path from the document root (`S1/V1/B1`); absent for an element with no path segment of its own. */
	path: string | undefined
}

/** An element of a document carrying a uuid. */
export type UuidRecord = {
	uuid: string
	ref: Scl.Ref<Scl.ElementsOf>
}
