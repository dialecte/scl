import type { Scl } from '@/v2019C1/config'

/** The reconcilable primaries of a topology scope (see `resolveTopologyReconcilables`). */
export type TopologyReconcilables = {
	applications: Scl.Ref<'Application'>[]
	/** Functions under the scope not composed by any Application (reconciled on their own). */
	standaloneFunctions: Scl.Ref<'Function'>[]
}
