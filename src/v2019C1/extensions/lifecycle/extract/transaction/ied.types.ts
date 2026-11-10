import type { Scl, Config } from '@/v2019C1/config'
import type { FileStart } from '@/v2019C1/extensions/history/transaction/start-file.types'
import type { IedProcessPlan } from '@/v2019C1/extensions/lifecycle/layers/ied/ied-process.types'
import type { IedCommunicationDescription } from '@/v2019C1/extensions/lifecycle/layers/ied/read-ied-communication.types'
import type { IedContentSelection } from '@/v2019C1/extensions/lifecycle/layers/ied/select-ied-content.types'
import type { SupervisionDependencyPlan } from '@/v2019C1/extensions/lifecycle/layers/ied/supervision-dependencies.types'
import type { LinkedSectionReading } from '@/v2019C1/extensions/lifecycle/linked-sections/description.types'
import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'
import type * as Core from '@dialecte/core'

/** Parameters of the in-progress selected IED instance copy, not yet a complete ISD export. */
export type IedExtractParams = {
	/** Source type follows its registered extension; .xml or no extension uses SCD, ignoring Header fileType. */
	sourceQuery: Core.Query<Config>
	/** The selected source IED, not necessarily the first IED in the source. */
	iedRef: Scl.Ref<'IED'>
	/** Initializes an ISD Header with a fresh file UUID and initial history. */
	fileType: 'ISD'
	/** Explicit 'instance' required for now; no default is implemented. */
	kind?: 'instance'
	/** Explicit 'none' required for now; omitted/default and later-binding conversion are unavailable. */
	inputs?: 'none' | 'later-binding'
	/** The labels of what the file holds, IED, data types and process part alike: kept by default, none with `false`. */
	labels?: boolean
	/** The applications holding a function the file holds, with only what they may still name: kept by default. */
	applications?: boolean
	/** The allocation roles holding a function the file holds, with only those references: kept by default. */
	allocationRoles?: boolean
	/** The power system relations of the functions the file holds, to equipment the file holds: kept by default. */
	powerSystemRelations?: boolean
	/** Manufacturer written on the output IED; the source manufacturer is unchanged. */
	issuer: NonNullable<Scl.AttributesValueObjectOf<'IED'>['manufacturer']>
	/** Tool recorded on the output Header. */
	tool: Scl.AttributesValueObjectOf<'Header'>['toolID']
	/** Author of the initial output history item. */
	who: Scl.AttributesValueObjectOf<'Hitem'>['who']
	/** Optional name structure passed to file initialization. */
	nameStructure?: Scl.AttributesValueObjectOf<'Header'>['nameStructure']
	/** Defaults to 'new'; 'revision' is refused with OPTION_NOT_AVAILABLE before writes. */
	as?: FileStart
}

/** What an IED export reads and decides before its first write. */
export type IedExport = {
	sourceFileType: SclFileType
	selection: IedContentSelection
	process: IedProcessPlan
	supervisionDependencies: SupervisionDependencyPlan
	description: IedCommunicationDescription
	linked: LinkedSectionReading
}
