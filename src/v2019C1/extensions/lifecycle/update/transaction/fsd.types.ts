import type { Config, Scl } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type {
	FsdFunctionRef,
	LifecycleScenario,
} from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { VariantSelection } from '@/v2019C1/extensions/lifecycle/layers/application'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type * as Core from '@dialecte/core'

/** What `tx.lifecycle.update.fsd` takes. */
export type UpdateFsdParams = {
	sourceQuery: Core.Query<Config>
	functionRef: FsdFunctionRef
	targetParent: Scl.Ref<Scl.ElementsOf>
	/** `instantiate` forces a fresh instance; `template` (default) reconciles. */
	scenario?: LifecycleScenario
	/** Placed afresh by a larger operation: a new instance whatever the project holds. */
	placesFresh?: boolean
	/** The previous revision of the file, for a fork: see {@link LifecycleRevisionBase}. Refused by another scenario. */
	baseQuery?: Core.Query<Config>
	/** What tells a dropped element from the project's own, when the caller read it already (once per apply). */
	removalBase?: RemovalBase
	/** The lineages a reference of the project may pair by name on: see `PlaceholderLineages`. */
	placeholderLineages?: PlaceholderLineages
	/** Multi-instance gate: partitioned per instance by `instanceScopeId`. */
	report?: DiffReport
	decisions?: DecisionMap
	/** Type-dedup name authority, forwarded to `importTypes`. Default `'target'`. */
	keepNameTypesFrom?: KeepNameTypesFrom
	/** Multi-instance anchor: scope to ONE target instance (or its subtree). Absent = all. */
	targetInstance?: Scl.Ref<Scl.ElementsOf>
	/** The consumer's choices for the shared elements the function is classified by. */
	decisionMappings?: DecisionMappings
	/** The function is placed by this operation alone (an FSD): see `instantiate.fsd`. */
	resolvePlacement?: boolean
	/** Placed as part of a larger template: see `instantiate.fsd`. */
	partOfTemplate?: boolean
	/**
	 * What a first placement is made for, when the report lists it once per instance: the instance
	 * of the application that gained it, or the instance of the unit of a larger template (the
	 * level it sits on) — the same before and after the write. Default: `targetParent`.
	 */
	placedFor?: Scl.Ref<Scl.ElementsOf>
	/**
	 * What the selection of functional variants of the application instances composing the function leaves out of
	 * its template: neither added nor written, at any depth.
	 */
	selection?: VariantSelection
}
