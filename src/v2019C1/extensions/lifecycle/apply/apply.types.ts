import type { Scl } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

/** How an apply wrote an instance: `placed` for the first time, or `reconciled` (matched, then updated). */
export type AppliedPlacement = 'placed' | 'reconciled'

/** An instance root a lifecycle write produced or reconciled, with how it was written. */
export type AppliedInstance<GenericTag extends Scl.ElementsOf> = {
	ref: Scl.Ref<GenericTag>
	placement: AppliedPlacement
}

/** A function or a subfunction a lifecycle write produced or reconciled. */
export type AppliedFunction = AppliedInstance<'Function' | 'SubFunction'>

/**
 * The instance roots a lifecycle write produced or reconciled, discriminated by
 * verb, each saying how it was written. Flat arrays are scenario-honest:
 * `instantiate` yields exactly one root set, every root `placed`; `update` may
 * reconcile several instances of one template (each listed `reconciled`, a
 * function an instance gains `placed`). A root the write left as it is (no
 * change of it accepted, its file reference not brought to the newer revision)
 * is not listed. The "not decided yet" apply track yields empty arrays.
 */
export type AppliedInstances =
	| { verb: 'fsd'; functions: AppliedInstance<'Function' | 'SubFunction'>[] }
	| {
			verb: 'asd'
			applications: AppliedInstance<'Application'>[]
			functions: AppliedInstance<'Function' | 'SubFunction'>[]
	  }
	| {
			verb: 'ssd'
			applications: AppliedInstance<'Application'>[]
			functions: AppliedInstance<'Function' | 'SubFunction'>[]
	  }
	| { verb: 'ied'; ieds: AppliedInstance<'IED'>[] }

/**
 * The result of `tx.lifecycle.apply`: the effective `report` plus the instance
 * roots the write produced/reconciled (`instances`). Consumers act on the roots
 * in the SAME transaction (name, wire, select, chain) without re-deriving them.
 */
export type ApplyResult = {
	report: DiffReport
	instances: AppliedInstances
}
