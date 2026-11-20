import type { RemovalBase } from './removal-base.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/** The newer revision, and the open document (read, or written in a transaction). */
export type IsSameFileParams = {
	sourceQuery: Core.Query<Config>
	target: Core.Query<Config> | Core.Transaction<Config>
}

/** The newer revision, the open document, and what of the revision the update leaves out (source record ids). */
export type ReadUpdateHoldsParams = IsSameFileParams & {
	leftOut?: ReadonlySet<string>
}

/** A removal base, and what `readUpdateHolds` reads to record what the update holds on it. */
export type WithUpdateHoldsParams = ReadUpdateHoldsParams & {
	removalBase: RemovalBase
}

/** The revision's named targets by uuid, and what the update leaves out. */
export type WithoutLeftOutParams = {
	found: ReadonlyMap<string, readonly AnyTrackedRecord[]>
	leftOut: ReadonlySet<string>
}

/** An element's tag, both sides' attributes, and the uuids the fork holds. */
export type UnresolvedRetargetsParams = {
	tagName: string
	sourceAttributes: Readonly<Record<string, string | undefined>>
	instanceAttributes: Readonly<Record<string, string | undefined>>
	uuids: ReadonlySet<string>
}
