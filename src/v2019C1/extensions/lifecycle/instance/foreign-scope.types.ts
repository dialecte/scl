import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
import type { AnyRefOrRecord, AnyTrackedRecord } from '@dialecte/core'

export type CollectForeignScopesParams = {
	/** Every instance of one template the project holds. */
	instances: readonly AnyTrackedRecord[]
}

/**
 * For each instance of a template, by its record id: the record ids of what belongs to the OTHER
 * instances of that template and not to it.
 */
export type ForeignScopes = ReadonlyMap<string, ReadonlySet<string>>

export type CollectForeignReferenceIdsParams = {
	/** The element the instances share: a role, a category, a variable. */
	sharedRootRef: AnyRefOrRecord
	/** What belongs to the other instances of the template. */
	foreignScope: ReadonlySet<string>
}

/**
 * What belongs to the other instances of the template an instance was made from. Asked for only
 * when an element the instances share is at hand, and worked out once.
 */
export type ResolveForeignScope = () => Promise<ReadonlySet<string>>

export type ForeignScopeResolverParams = {
	/** The instance at hand. */
	instanceRootRef: AnyRefOrRecord
	/** The `uuid` of the source element the instance was made from. */
	sourceUuid: string | undefined
	/** How an instance carries the uuid of its source element. Default `templateUuid`. */
	matchKey?: MatchKey
}
