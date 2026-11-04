import type { Config, Scl } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type {
	AppliedFunction,
	AppliedInstance,
} from '@/v2019C1/extensions/lifecycle/apply/apply.types'
import type {
	LifecycleScenario,
	SharedFunctions,
} from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type * as Core from '@dialecte/core'

/** What `tx.lifecycle.update.asd` takes. */
export type UpdateAsdParams = {
	sourceQuery: Core.Query<Config>
	applicationRef: Scl.Ref<'Application'>
	targetParent: Scl.Ref<Scl.ElementsOf>
	/** `instantiate` forces a fresh instance; `template` (default) reconciles. */
	scenario?: LifecycleScenario
	/** Placed afresh by a larger operation: a new instance whatever the project holds. */
	placesFresh?: boolean
	/** The previous revision of the file, for a fork: see {@link LifecycleRevisionBase}. Refused by another scenario. */
	baseQuery?: Core.Query<Config>
	/** Whether a first placement stands on a function another application placed there: see `Resolution.sharedFunctions`. */
	sharedFunctions?: SharedFunctions
	/** What tells a dropped element from the project's own, when the caller read it already (once per apply). */
	removalBase?: RemovalBase
	/** The lineages a reference of the project may pair by name on: see `PlaceholderLineages`. */
	placeholderLineages?: PlaceholderLineages
	report?: DiffReport
	decisions?: DecisionMap
	/** Type-dedup name authority, forwarded to `importTypes`. Default `'target'`. */
	keepNameTypesFrom?: KeepNameTypesFrom
	/** Multi-instance anchor: scope to ONE target instance (or its subtree). Absent = all. */
	targetInstance?: Scl.Ref<Scl.ElementsOf>
	/** The consumer's choices for the shared elements the application refers to. */
	decisionMappings?: DecisionMappings
	/** The application is placed by this operation alone (an ASD): see `instantiate.asd`. */
	resolvePlacement?: boolean
	/** Placed as part of a larger template: see `instantiate.asd`. */
	partOfTemplate?: boolean
	/**
	 * What a first placement is made for, when the report lists it once per instance of the unit
	 * of a larger template: that instance (the level it sits on) — the same before and after the
	 * write. Default: `targetParent`.
	 */
	placedFor?: Scl.Ref<Scl.ElementsOf>
}

/** The roots `tx.lifecycle.update.asd` or `.ssd` wrote, each saying how it was written. */
export type WrittenApplications = {
	applications: AppliedInstance<'Application'>[]
	functions: AppliedFunction[]
}
