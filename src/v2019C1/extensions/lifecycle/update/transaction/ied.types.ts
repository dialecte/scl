import type { Config, Scl } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { TakeOvers } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { PlacedIedFileType } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
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
	/** The report the decisions answer. Absent: everything the revision brings is written. */
	report?: DiffReport
	decisions?: DecisionMap
	keepNameTypesFrom?: KeepNameTypesFrom
	/** The values the project keeps that the consumer takes the template's for (`Resolution.takeOver`). */
	takeOver?: TakeOvers
}

export type ReconcileIedParams = Omit<UpdateIedParams, 'fileType' | 'targetInstance'> & {
	/** The type of file the template is: the revision the IED records. */
	fileType: SclFileType
	/** The IED of the project the update starts from (see `resolveIedInstance`). */
	instance: AnyTrackedRecord
	removalBase: RemovalBase
	placeholderLineages: PlaceholderLineages
}
