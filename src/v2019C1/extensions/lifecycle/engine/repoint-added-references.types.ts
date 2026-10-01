import type { Scl } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type { AnyRefOrRecord } from '@dialecte/core'

export type RepointAddedReferencesParams = {
	/** Everything the update added to the instance: each source record and the copy made of it. */
	cloneMappings: readonly Scl.CloneMapping[]
	/** The instance the update reconciled — what tells its elements from another instance's. */
	instanceRootRef: AnyRefOrRecord
	/** How an element of the instance carries the uuid of its source element. */
	matchKey: MatchKey
	/** Source elements already known to stand for an element the instance holds. */
	redirectMappings?: readonly RedirectMapping[]
}

/** What an update added to one instance, kept until every element it can refer to exists. */
export type InstanceAdditions = {
	instanceRootRef: AnyRefOrRecord
	cloneMappings: Scl.CloneMapping[]
}

export type FindInstanceCounterpartParams = {
	/** The `uuid` of the source element. */
	sourceUuid: string
	/** The tags the reference can point at. */
	targetTags: readonly string[]
	matchKey: MatchKey
	/** Record ids of the elements of the instance, resolved only when several elements qualify. */
	resolveInstanceScope: () => Promise<ReadonlySet<string>>
}
