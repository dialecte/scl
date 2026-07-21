import type { Scl } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

/**
 * The instance roots a lifecycle write produced or reconciled, discriminated by
 * verb. Flat arrays are scenario-honest: `instantiate` yields exactly one root
 * set; `update` may reconcile several instances of one template (all listed).
 * The "not decided yet" apply track yields empty arrays.
 */
export type AppliedInstances =
	| { verb: 'fsd'; functions: (Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>)[] }
	| {
			verb: 'asd'
			applications: Scl.Ref<'Application'>[]
			functions: (Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>)[]
	  }

/**
 * The result of `tx.lifecycle.apply`: the effective `report` plus the instance
 * roots the write produced/reconciled (`instances`). Consumers act on the roots
 * in the SAME transaction (name, wire, select, chain) without re-deriving them.
 */
export type ApplyResult = {
	report: DiffReport
	instances: AppliedInstances
}
