import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** A reader with the untyped `.any` facade — either a Query or a Transaction. */
export type InstanceReader = Core.Query<Config> | Core.Transaction<Config>

/**
 * The instances an update or a report is scoped to: one the consumer names, or those one operation owns (the
 * applications and functions of an IED's specification). See `scopeToTargetInstance`.
 */
export type TargetInstances = Scl.Ref<Scl.ElementsOf> | readonly Scl.Ref<Scl.ElementsOf>[]
