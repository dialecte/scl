import type { Config, Scl } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { AppliedFunction } from '@/v2019C1/extensions/lifecycle/apply/apply.types'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { AcceptedIds } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { TargetInstances } from '@/v2019C1/extensions/lifecycle/instance'
import type { VariantSelection } from '@/v2019C1/extensions/lifecycle/layers/application'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/** One instance of the application the update goes through. */
export type ApplicationInstance = {
	instance: AnyTrackedRecord
	/** What its own groups let the update write: absent without decisions (everything is written). */
	accepted: AcceptedIds | undefined
}

export type CascadeComposedFunctionsParams = {
	sourceQuery: Core.Query<Config>
	applicationRef: Scl.Ref<'Application'>
	/** The element of the project the consumer started from. */
	targetParent: Scl.Ref<Scl.ElementsOf>
	/** The instances of the application, each with the functions it composes. */
	applicationInstances: readonly ApplicationInstance[]
	scenario?: LifecycleScenario
	/** What tells an element the source dropped from one the project added, read once for the update. */
	removalBase: RemovalBase
	/** The lineages a reference of the project may pair by name on: see `PlaceholderLineages`. */
	placeholderLineages?: PlaceholderLineages
	report?: DiffReport
	decisions?: DecisionMap
	keepNameTypesFrom?: KeepNameTypesFrom
	targetInstance?: TargetInstances
	/**
	 * What the template's elements outside the primary stand for in the project, beyond what the update matches by
	 * lineage: for the specification of an IED, the IED's logical nodes, so an LNode the update adds is bound to the
	 * IED updated, not to another placed from the same template.
	 */
	redirectMappings?: readonly RedirectMapping[]
	decisionMappings?: DecisionMappings
	/** What each instance of the application's selection of variants leaves out, by instance record id. */
	selections?: ReadonlyMap<string, VariantSelection>
}

export type ComposedFunctionsCascade = {
	/** The functions written, each placed or reconciled: one the update wrote nothing to is not listed. */
	functions: AppliedFunction[]
	/**
	 * For each instance of the application, by its record id: the function that stands, for that
	 * instance, for a function the template gained.
	 */
	redirectMappings: Map<string, RedirectMapping[]>
	/**
	 * For each instance of the application, by its record id: the record ids of the functions of the project it stands
	 * on — those it owns, takes where it stands, and those placed for it — whether this update wrote them or not.
	 */
	standsOn: Map<string, Set<string>>
}
