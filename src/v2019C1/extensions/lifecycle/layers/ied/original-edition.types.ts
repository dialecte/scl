import type { Config, Scl } from '@/v2019C1/config'
import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'
import type * as Core from '@dialecte/core'

export type FillOriginalEditionParams = {
	sourceQuery: Core.Query<Config>
	/** The IED placed in the project. */
	placed: Scl.Ref<'IED'>
	/** The type of file the IED was placed from. */
	fileType: SclFileType
}

/** The original edition a placed IED records: `originalSclVersion`, `originalSclRevision`, `originalSclRelease`. */
export type OriginalEdition = {
	originalSclVersion?: string
	originalSclRevision?: string
	originalSclRelease?: string
}
