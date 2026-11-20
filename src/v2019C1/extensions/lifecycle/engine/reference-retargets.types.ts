import type { Config } from '@/v2019C1/config'
import type { NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/** The newer revision's subtree, and the documents whose elements count as held by the fork. */
export type ReadRetargetUuidsParams = {
	sourceTree: AnyTreeRecord
	holders: readonly (Core.Query<Config> | Core.Transaction<Config>)[]
}

/** An element's tag, both sides' attributes, and the uuids the fork holds. */
export type UnresolvedRetargetsParams = {
	tagName: string
	sourceAttributes: Readonly<Record<string, string | undefined>>
	instanceAttributes: Readonly<Record<string, string | undefined>>
	uuids: ReadonlySet<string>
}

/** The update's names rule, the newer revision, and the open document (read, or written in a transaction). */
export type RetargetsInParams = {
	namesFollow: NamesFollow
	sourceQuery: Core.Query<Config>
	target: Core.Query<Config> | Core.Transaction<Config>
}
