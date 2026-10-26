import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** A reader with the untyped `.any` facade — either a Query or a Transaction. */
export type InstanceReader = Core.Query<Config> | Core.Transaction<Config>
