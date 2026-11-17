import type { Config, Scl } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { CollisionOverrides } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { ScenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'
import type * as Core from '@dialecte/core'

/** The files an IED is placed from as a new IED. */
export type PlacedIedFileType = Extract<SclFileType, 'ISD' | 'ICD'>

export type IedParams = {
	sourceQuery: Core.Query<Config>
	/** The IED of the source file to place. */
	iedRef: Scl.Ref<'IED'>
	/** The root of the project the IED is placed under. */
	anchor: Scl.Ref<'SCL'>
	/** The type of file the source is, recorded in the IED's provenance: an IED is placed from an ISD or an ICD. */
	fileType: PlacedIedFileType
	/**
	 * The scenario the placement is made for: `instantiate` (default) or `template` place a new IED — uuids of its own,
	 * the source's as their lineage, its provenance; `fork` places the file's elements as they are, no provenance.
	 */
	scenario?: LifecycleScenario
	/** User-edited values per source element id: the IED's name the consumer chose in the review. */
	overrides?: CollisionOverrides
	/** Type-dedup name authority, forwarded to `importTypes`. Default `'target'`. */
	keepNameTypesFrom?: KeepNameTypesFrom
	/** The lineages a reference of the project may pair by name on: see `PlaceholderLineages`. */
	placeholderLineages?: PlaceholderLineages
	/** The consumer's choices for the specification the file carries: where each of its levels lands. */
	decisionMappings?: DecisionMappings
	/** The source elements of the specification the consumer left out (record ids). */
	leftOut?: ReadonlySet<string>
}

export type CloneSpecificationParams = IedParams & {
	/** The policy of the scenario the placement is made for. */
	policy: ScenarioPolicy
}

export type SettleIedParams = IedParams & {
	/** The policy of the scenario the placement is made for. */
	policy: ScenarioPolicy
	/** The IED placed. */
	placed: Scl.Ref<'IED'>
	/** What the Communication part of the placement cloned. */
	connections: readonly Scl.CloneMapping[]
}

export type IedResult = {
	/** The IED placed in the project. */
	iedRef: Scl.Ref<'IED'>
	/** Each source record and the copy made of it, for everything the placement cloned. */
	cloneMappings: Scl.CloneMapping[]
}
