import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { CollisionOverrides } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type { PlacementLevel, SsdScope } from '@/v2019C1/extensions/lifecycle/layers/topology'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { ScenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'

export type CloneProcessSectionParams = {
	sourceQuery: Core.Query<Config>
	/** The part of the source placed: see `resolveSsdScope`. */
	scope: SsdScope
	/** The project element the placement starts from. */
	targetParent: Scl.Ref<Scl.ElementsOf>
	/** The policy of the scenario the placement is made for. */
	policy: ScenarioPolicy
	/** The consumer's choices: where a level lands, the shared elements the applications refer to. */
	decisionMappings?: DecisionMappings
	/** The source elements the consumer left out (record ids). */
	leftOut?: ReadonlySet<string>
}

/** What the clone step of a process-section placement wrote, before its identity is settled. */
export type ClonedProcessSection = {
	/** The scope's root (source side). */
	root: Scl.Ref<TopologyStructuralTag>
	/** Each source record and its copy: the frame, the placed functions and applications, their satellites. */
	cloneMappings: Scl.CloneMapping[]
	/** The source elements landed on elements the project holds (nothing cloned for them). */
	redirectMappings: RedirectMapping[]
	/** Where each level of the source lands. */
	placementLevels: PlacementLevel[]
	/** Source structural element id -> its target. */
	frameIndex: Map<string, Scl.Ref<Scl.ElementsOf>>
	/** Source refs of the top-level placed elements. */
	placedRoots: Scl.Ref<Scl.ElementsOf>[]
	/** The structure above the scope root, as placed. */
	scopeStructure: TargetStructure
}

export type SettleProcessSectionParams = {
	sourceQuery: Core.Query<Config>
	/** What the clone step wrote, its identity finalized. */
	cloned: ClonedProcessSection
	/** The project element the placement started from. */
	targetParent: Scl.Ref<Scl.ElementsOf>
	/** The policy of the scenario the placement is made for. */
	policy: ScenarioPolicy
	/** User-edited values per source element id: the names the consumer chose. */
	overrides?: CollisionOverrides
	/** The consumer's choices for the shared elements. */
	decisionMappings?: DecisionMappings
	/** Every clone mapping of the placement, the IED's among them: the shared elements created are named from them. */
	cloneMappings: readonly Scl.CloneMapping[]
}
