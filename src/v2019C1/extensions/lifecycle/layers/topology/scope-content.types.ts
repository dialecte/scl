import type { Scl } from '@/v2019C1/config'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type { AnyTreeRecord } from '@dialecte/core'

/** The reconcilable primaries of a topology scope (see `resolveTopologyReconcilables`). */
export type TopologyReconcilables = {
	applications: Scl.Ref<'Application'>[]
	/** Functions under the scope not composed by any Application (reconciled on their own). */
	standaloneFunctions: Scl.Ref<'Function'>[]
}

/** What a unit of a substation template places beyond its subtree, and what it places (see `resolveUnitPlacement`). */
export type UnitPlacement = {
	/** What the references of what travels with the unit may name. */
	scope: ContributionScope
	/** The functions its applications compose, wherever they sit, but one left out. */
	composedRefs: Scl.Ref<'Function'>[]
	/**
	 * What the functions it places hold, the functions included (record ids): those its applications compose, and the
	 * functions of the scope but one left out.
	 */
	functionContentIds: ReadonlySet<string>
	/** The trees of the functions it places, each once: the functions of the scope but one left out, those its applications compose. */
	functionTrees: readonly AnyTreeRecord[]
}
