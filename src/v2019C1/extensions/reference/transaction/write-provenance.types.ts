import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** Which template kind produced the instance (selects the SclRef element + fileType). */
export type ProvenanceFileType = 'FSD' | 'ASD'

export type WriteProvenanceParams = {
	/** Query over the template document the instance was created from. */
	sourceQuery: Core.Query<Config>
	/** Cloned root element in the target: `Function` for FSD, `Application` for ASD. */
	targetRoot: Scl.Ref<Scl.ElementsOf>
	/** Template kind; selects `FunctionSclRef` (FSD) or `ApplicationSclRef` (ASD). */
	fileType: ProvenanceFileType
}
