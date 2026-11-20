import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export type CompareFileIdentityParams = {
	/** The document read first: the open one (read, or written in a transaction), or the newer revision. */
	query: Core.Query<Config> | Core.Transaction<Config>
	/** The other document: the other version, or the previous revision. */
	otherQuery: Core.Query<Config>
}

/**
 * What the Headers of two documents say of their file: the uuid each names (absent when its Header names none), and
 * whether both name the same file (`sameFile`), never so when either names none.
 */
export type FileIdentity = {
	fileUuid: string | undefined
	otherFileUuid: string | undefined
	sameFile: boolean
}
