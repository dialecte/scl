import type { UpdateSsdParams } from './ssd.types'
import type { Scl } from '@/v2019C1/config'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { InstanceAdditions } from '@/v2019C1/extensions/lifecycle/engine/repoint-added-references.types'
import type { PrimaryMove } from '@/v2019C1/extensions/lifecycle/layers/topology'
import type {
	SsdScope,
	TopologyReconcilables,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import type { ScenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'

/** What `updateProcessSection` takes: the update's parameters, with what its caller read once. */
export type UpdateProcessSectionParams = Omit<
	UpdateSsdParams,
	'scopeRef' | 'baseQuery' | 'removalBase'
> & {
	/** The part of the source updated: see `resolveSsdScope`. */
	scope: SsdScope
	/** The scope's applications and the functions none of them composes. */
	reconcilables: TopologyReconcilables
	/** The policy of the scenario the update is made for. */
	policy: ScenarioPolicy
	/** What tells a dropped element from the project's own. */
	removalBase: RemovalBase
	/**
	 * The instances of the applications and functions the update is scoped to, beside the frame `targetInstance` names:
	 * those one IED's specification holds, another placement's on the same level left alone. Absent: those under
	 * `targetInstance`.
	 */
	primaryTargets?: readonly Scl.Ref<Scl.ElementsOf>[]
	/** The one instance of the unit a primary the template gained is placed in: see `ResolvePrimaryParentsParams`. */
	gainedIn?: Scl.Ref<Scl.ElementsOf>
	/** What the template's elements outside a primary stand for in the project: see `UpdateFsdParams`. */
	redirectMappings?: readonly RedirectMapping[]
}

/** The moves of a primary's held instances, the report and decisions gating them, the levels the frame added. */
export type WritePrimaryMovesParams = {
	moves: readonly PrimaryMove[]
	/** None for a headless update: every move is written. */
	report: DiffReport | undefined
	decisions: DecisionMap | undefined
	/** What the frame reconcile added in each instance of the unit: a gained level a move lands in is among it. */
	frameAdditions: readonly InstanceAdditions[]
}
