import type { ExtractWarning } from './extract.types'
import type { CLIENT_REFS, INTERACTING_IEDS } from './ied.constants'
import type { Scl, Config } from '@/v2019C1/config'
import type { FileStart } from '@/v2019C1/extensions/history/transaction/start-file.types'
import type { IedProcessPlan } from '@/v2019C1/extensions/lifecycle/layers/ied/ied-process.types'
import type { IedCommunicationDescription } from '@/v2019C1/extensions/lifecycle/layers/ied/read-ied-communication.types'
import type { IedContentSelection } from '@/v2019C1/extensions/lifecycle/layers/ied/select-ied-content.types'
import type { SupervisionDependencyPlan } from '@/v2019C1/extensions/lifecycle/layers/ied/supervision-dependencies.types'
import type { LinkedSectionReading } from '@/v2019C1/extensions/lifecycle/linked-sections/description.types'
import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'
import type * as Core from '@dialecte/core'

/** The kind of ISD an IED export writes: an instance of the project, or a template independent of it. */
export type IsdKind = 'instance' | 'template'

/** What every IED export reads and records: the source, the selected IED and the file's start. */
export type IedExtractBase = {
	/** Source type follows its registered extension; .xml or no extension uses SCD, ignoring Header fileType. */
	sourceQuery: Core.Query<Config>
	/**
	 * The document the export records as its source, at the Header (and, for an instance ISD, on the IED; a template records
	 * none), its type read from its extension as for the source: the source document by default. What the file holds is still
	 * read from `sourceQuery`.
	 */
	provenanceQuery?: Core.Query<Config>
	/** The selected source IED, not necessarily the first IED in the source. */
	iedRef: Scl.Ref<'IED'>
	/** Tool recorded on the output Header. */
	tool: Scl.AttributesValueObjectOf<'Header'>['toolID']
	/** Author of the initial output history item. */
	who: Scl.AttributesValueObjectOf<'Hitem'>['who']
	/** Optional name structure passed to file initialization. */
	nameStructure?: Scl.AttributesValueObjectOf<'Header'>['nameStructure']
	/** Defaults to 'new'; 'revision' is refused with OPTION_NOT_AVAILABLE before writes. */
	as?: FileStart
}

/** Parameters of `extract.ied`, by the type of the file written: an ISD of a specification IED, or a CID of a real IED. */
export type IedExtractParams = IsdExtractParams | CidExtractParams

/**
 * Which IEDs a CID holds besides the selected one: none (`'none'`), or the IEDs its inputs are bound to, each with only the
 * part they send it (`'publishers'`). A CID carries what the IED shall know: the control blocks it subscribes to and their
 * addresses, so that its configuration tool can set up its subscriptions. No default: the caller states what the file holds.
 */
export type InteractingIeds = (typeof INTERACTING_IEDS)[number]

/**
 * What a CID does with the receivers and report clients its control blocks name: kept (`'keep'`, the default: both lists are
 * optional, and a report client reserves report instances in the device), or those naming an IED absent from the file removed
 * (`'cleanAbsent'`). Either way an entry naming an absent IED is listed.
 */
export type ClientRefs = (typeof CLIENT_REFS)[number]

/** Parameters of `extract.ied` writing the CID of one real IED. */
export type CidExtractParams = IedExtractBase & {
	/** Initializes a CID Header with a fresh file UUID and initial history. */
	fileType: 'CID'
	/** Required, no default: see {@link InteractingIeds}. */
	interactingIeds: InteractingIeds
	/** `'keep'` by default: see {@link ClientRefs}. */
	clientRefs?: ClientRefs
}

/** Parameters of `extract.ied` writing the ISD of one specification IED. */
export type IsdExtractParams = IedExtractBase & {
	/** Initializes an ISD Header with a fresh file UUID and initial history. */
	fileType: 'ISD'
	/**
	 * The kind of ISD written, required, no default: an `'instance'` of the project (the IED's name, the levels' names and
	 * every identifier as in the project, the project recorded as its source), or a `'template'` serving every device of a
	 * frame agreement (see `extract.ied`).
	 */
	kind?: IsdKind
	/**
	 * The inputs of the IED's logical nodes: none (`'none'`), or each in later-binding form (`'later-binding'`): its
	 * description, internal address and expected data and service, its service type equal to the expected service, and
	 * nothing of the source it is bound to (no IED, address or control block); a receiver or client naming the IED
	 * itself is then left out, as no input subscribes any more (with `'none'` it stays, like other self references).
	 * Required: no default.
	 */
	inputs?: 'none' | 'later-binding'
	/**
	 * A specified flow whose two LNodes are both written LNodes of the IED is written as an internal service, with no link
	 * to the input implementing it; the source keeps the service it specifies. Off by default: the service as specified.
	 */
	internalService?: boolean
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
}

/** What `extract.ied` returns: what it left out or changed and says so, and the name the file is suggested to be saved as. */
export type IedExtractResult = {
	warnings: ExtractWarning[]
	/** The name the file is suggested to be saved as, with the extension of its type: `<IED>.cid`; an ISD its Header's file name with `.isd`. */
	fileName: string
}

/** What a real IED's export reads and decides before its first write. */
export type RealIedExport = {
	sourceFileType: SclFileType
	selection: IedContentSelection
	description: IedCommunicationDescription
	linked: LinkedSectionReading
	/** The IED's own lists of minimum project files in the source, written back exactly. */
	minimumScdFiles: readonly Scl.Ref<'MinRequestedSCDFiles'>[]
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
