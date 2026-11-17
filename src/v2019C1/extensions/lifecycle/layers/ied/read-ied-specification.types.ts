import type { SpecificationInstance } from './resolve-specification-instance.types'
import type { Config, Scl } from '@/v2019C1/config'
import type {
	SsdScope,
	TopologyReconcilables,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'
import type * as Core from '@dialecte/core'

/** What `readIedSpecification` takes. */
export type ReadIedSpecificationParams = {
	sourceQuery: Core.Query<Config>
	/** The type of file the template is: only an ISD carries a specification. */
	fileType: SclFileType | undefined
	/** The IED of the project updated. */
	iedRef: Scl.Ref<'IED'>
}

/** The specification an ISD carries beside its IED, and what the project holds of it for the IED updated. */
export type IedSpecification = {
	/** The template's specification (see `resolveSsdScope`), what is not told apart left out. */
	scope: SsdScope
	/** Its applications and the functions none of them composes, what is not told apart left out. */
	reconcilables: TopologyReconcilables
	/** What the project holds of it for the IED: `undefined` when it holds none. */
	instance: SpecificationInstance | undefined
}
