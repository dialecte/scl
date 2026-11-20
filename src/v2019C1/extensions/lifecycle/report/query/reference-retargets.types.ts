import type { Config } from '@/v2019C1/config'
import type {
	DecisionGroup,
	DiffReport,
	ReportWarning,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { NamedTarget } from '@/v2019C1/extensions/reference/query/find/named-targets.types'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/** A fork's report, and the newer revision it was made from. */
export type LinkRetargetsParams = {
	report: DiffReport
	sourceQuery: Core.Query<Config>
}

/** A reference a group re-targets: the uuid it now names, the attribute holding it, what that uuid may name. */
export type Retarget = {
	group: DecisionGroup
	uuid: string
	attribute: string
	named: NamedTarget[]
	reference: AnyRefOrRecord | undefined
}

/** The groups of a report. */
export type GroupsAddingParams = {
	groups: readonly DecisionGroup[]
}

/** What a fork's re-targets add to the report: the groups each re-targeting group now waits for, and the warnings. */
export type RetargetLinks = {
	dependsOn: ReadonlyMap<string, readonly string[]>
	warnings: ReportWarning[]
}
