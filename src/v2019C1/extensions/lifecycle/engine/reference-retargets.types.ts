import type { RemovalBase } from './removal-base.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * The newer revision, the open document (read, or written in a transaction), the update's source root (what it brings
 * sits under it; absent: the whole revision, an IED's update), and what of the revision it leaves out (source record
 * ids).
 */
export type ReadUpdateHoldsParams = {
	sourceQuery: Core.Query<Config>
	target: Core.Query<Config> | Core.Transaction<Config>
	within?: Scl.Ref<Scl.ElementsOf>
	leftOut?: ReadonlySet<string>
}

/** A removal base, and what `readUpdateHolds` reads to record what the update holds on it. */
export type WithUpdateHoldsParams = ReadUpdateHoldsParams & {
	removalBase: RemovalBase
}

/** The revision's named targets by uuid, the update's source root, and what it leaves out. */
export type BroughtByParams = {
	found: ReadonlyMap<string, readonly AnyTrackedRecord[]>
	leftOut: ReadonlySet<string>
	within: Scl.Ref<Scl.ElementsOf> | undefined
}

/** An element's tag, both sides' attributes, and the uuids the fork holds. */
export type UnresolvedRetargetsParams = {
	tagName: string
	sourceAttributes: Readonly<Record<string, string | undefined>>
	instanceAttributes: Readonly<Record<string, string | undefined>>
	uuids: ReadonlySet<string>
}
