import type { Config, Scl } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
import type * as Core from '@dialecte/core'

export type ResolveInstanceLevelsParams = {
	sourceQuery: Core.Query<Config>
	/** The unit of the template: the first named level. */
	scopeRef: Scl.Ref<Scl.ElementsOf>
	/** The level of the project the instance of the unit sits on. */
	frameInstance: Scl.Ref<Scl.ElementsOf>
	matchKey?: MatchKey
}

/**
 * The level of the project each level of a template's unit stands on, for one instance — by the
 * record id of the source level. `undefined`: the instance holds no level for it.
 */
export type InstanceLevels = ReadonlyMap<string, Scl.Ref<Scl.ElementsOf> | undefined>
