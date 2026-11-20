import type { Config, Scl } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { TakeOvers } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { PlacedIedFileType } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import type { FileCommunications } from '@/v2019C1/extensions/lifecycle/layers/ied/file-communication.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { ScenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

export type UpdateIedParams = {
	sourceQuery: Core.Query<Config>
	/** The IED of the template file. */
	iedRef: Scl.Ref<'IED'>
	/** The root of the project. */
	anchor: Scl.Ref<'SCL'>
	/** The type of file the template is (only an ISD's IED is updated yet): the revision the IED records. */
	fileType: PlacedIedFileType
	/** The IED of the project the update starts from: required when the project holds several instances. */
	targetInstance?: Scl.Ref<'IED'>
	/**
	 * `template` (the default): a newer revision of the template the IED was placed from. `fork`: another version of the
	 * open ISD, whose IED it updates by uuid, following the other version.
	 */
	scenario?: 'template' | 'fork'
	/** The report the decisions answer. Absent: everything the revision brings is written. */
	report?: DiffReport
	decisions?: DecisionMap
	keepNameTypesFrom?: KeepNameTypesFrom
	/** The values the project keeps that the consumer takes the template's for (`Resolution.takeOver`). */
	takeOver?: TakeOvers
	/** The consumer's choices for the specification: where its levels land (`Resolution.mappings`). */
	decisionMappings?: DecisionMappings
}

export type ReconcileIedParams = Omit<UpdateIedParams, 'fileType' | 'targetInstance'> & {
	/** The type of file the template is: the revision the IED records. */
	fileType: SclFileType
	/** The IED of the project the update starts from (see `resolveIedInstance`). */
	instance: AnyTrackedRecord
	/** The scenario's policy, read once at the verb's entry. */
	policy: ScenarioPolicy
	removalBase: RemovalBase
	placeholderLineages: PlaceholderLineages
}

/** An IED update's parameters and the Communication of both versions of the file. */
export type ReconcileFileCommunicationParams = ReconcileIedParams & {
	communications: FileCommunications
}
