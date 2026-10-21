import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { CollisionOverrides } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type * as Core from '@dialecte/core'

export type SsdParams = {
	sourceQuery: Core.Query<Config>
	/** The SSD scope to instantiate. Defaults to the SSD's instantiable root. */
	scopeRef?: Scl.Ref<TopologyStructuralTag>
	/** Target parent the SSD content is instantiated under (e.g. a project Bay). */
	targetParent: Scl.Ref<Scl.ElementsOf>
	/**
	 * The scenario the placement is made for: `instantiate` (default) places a new instance — a uuid of its own, the
	 * template's as its lineage, its provenance; `fork` places the file's elements as they are — their uuids, no
	 * provenance of their own; `template` places as `instantiate`.
	 */
	scenario?: LifecycleScenario
	/** User-edited values per source element id (full track); drives collision override. */
	overrides?: CollisionOverrides
	/** Type-dedup name authority, forwarded to `importTypes`. Default `'target'`. */
	keepNameTypesFrom?: KeepNameTypesFrom
	/** The consumer's choices for the shared elements the applications refer to. */
	decisionMappings?: DecisionMappings
	/**
	 * The source elements the consumer left out (record ids): a level and what it holds, an
	 * application, a function. Nothing left out: the whole scope is placed.
	 */
	leftOut?: ReadonlySet<string>
}

export type SsdResult = {
	/** The SSD scope root that was instantiated (source-side ref). */
	scopeRef: Scl.Ref<TopologyStructuralTag>
	/**
	 * Each source record and the copy made of it, for everything the operation cloned: the reproduced
	 * frame, the placed Functions and Applications, and the cross-cutting satellites carried with them.
	 */
	cloneMappings: Scl.CloneMapping[]
}
