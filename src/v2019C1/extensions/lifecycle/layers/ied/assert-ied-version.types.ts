import type { IedOperation } from './assert-ied-placement.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export type CheckIedVersionParams = {
	/** The other file, the fork takes changes over from. */
	sourceQuery: Core.Query<Config>
	/** The uuid of the other file's IED, as `checkIedSource` reads it. */
	otherIedUuid: string | undefined
	/** The operation refusing, named in the error's detail. */
	operation: IedOperation
}

/** Why the other file is not a version of the open ISD, as `NOT_A_VERSION_OF_FILE` tells it in `meta.reason`. */
export type NotAVersionReason = 'other-file' | 'other-ied'
