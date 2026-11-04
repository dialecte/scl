import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type * as Core from '@dialecte/core'

/** What `tx.lifecycle.update.ssd` takes. */
export type UpdateSsdParams = {
	sourceQuery: Core.Query<Config>
	/** The element of the SSD the consumer names; none: read from the file (see `resolveSsdScope`). */
	scopeRef?: Scl.Ref<TopologyStructuralTag>
	targetParent: Scl.Ref<Scl.ElementsOf>
	scenario?: LifecycleScenario
	/** The previous revision of the file, for a fork: see {@link LifecycleRevisionBase}. Refused by another scenario. */
	baseQuery?: Core.Query<Config>
	/** What tells a dropped element from the project's own, when the caller read it already (once per apply). */
	removalBase?: RemovalBase
	/** The lineages a reference of the project may pair by name on: see `PlaceholderLineages`. */
	placeholderLineages?: PlaceholderLineages
	report?: DiffReport
	decisions?: DecisionMap
	keepNameTypesFrom?: KeepNameTypesFrom
	/** Multi-instance anchor: scope to ONE placed Bay (frame + fn/app under it). Absent = all. */
	targetInstance?: Scl.Ref<Scl.ElementsOf>
	/** The consumer's choices for the shared elements the applications refer to. */
	decisionMappings?: DecisionMappings
}
