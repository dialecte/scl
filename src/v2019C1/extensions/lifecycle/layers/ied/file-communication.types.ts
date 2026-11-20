import type { Config, Scl } from '@/v2019C1/config'
import type { ScenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'

/** The Communication of each version of the file: the other version's, and the open document's. */
export type FileCommunications = {
	source: Scl.Ref<'Communication'>
	target: Scl.Ref<'Communication'>
}

/** The other version of the file, the root of the open document, and the policy of the update. */
export type ReadFileCommunicationsParams = {
	sourceQuery: Core.Query<Config>
	anchor: Scl.Ref<'SCL'>
	policy: ScenarioPolicy
}
