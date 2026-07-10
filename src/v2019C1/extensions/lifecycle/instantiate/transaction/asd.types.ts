import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export type AsdParams = {
	sourceQuery: Core.Query<Config>
	/** The Application carried by the ASD to instantiate. */
	applicationRef: Scl.Ref<'Application'>
	/** Target parent the application content is instantiated under (e.g. a project Bay). */
	targetParent: Scl.Ref<Scl.ElementsOf>
}
