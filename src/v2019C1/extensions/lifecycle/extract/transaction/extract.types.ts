import type { Scl } from '@/v2019C1/config'
import type { FileStart } from '@/v2019C1/extensions/history/transaction/start-file.types'
import type { BoundIedAssignment } from '@/v2019C1/extensions/lifecycle/ied/bound-ieds.types'
import type { IedKind } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds.types'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction/structure.types'

/** Whether the element extracted stays an instance of the template it was made from. */
export type TemplateLink = 'keep' | 'break'

/** What every extract writes besides the content: which file, and the element's link to its template. */
export type ExtractOptions = {
	/**
	 * The file written: a new template (`'new'`, default: a uuid of its own, version `0`, revision `1`), or a new
	 * revision of the template the element came from (`'revision'`: not available yet, refused with
	 * `OPTION_NOT_AVAILABLE`).
	 */
	as?: FileStart
	/**
	 * The element extracted (the function, the application, the level) keeps its template link (`'keep'`, default: its
	 * `templateUuid`, `originUuid` and its own file reference), or loses it (`'break'`) — and so does what came with its
	 * instance, except an element recording a source file of its own, with what it holds.
	 */
	templateLink?: TemplateLink
}

/**
 * What an extract left out or moved and says so: an IED the selection leaves out, an input from or an address of what is
 * not carried, a reference to an IED not carried, a satellite moved, renamed, or not placed.
 */
export type ExtractWarning =
	| {
			/** An LNode of the IED implemented by a logical node the IED export leaves out (a supervision one): not written. */
			code: 'process-lnode-left-out'
			source: Scl.Ref<'LNode'>
			reason: 'target-not-carried'
	  }
	| {
			/** An input or output specification kept with its link to what the file does not hold cleared: the attributes removed. */
			code: 'process-reference-cut'
			source: Scl.Ref<'SourceRef' | 'ControlRef'>
			attributes: string[]
	  }
	| {
			/** A behaviour description using LNodes the file does not hold: left out whole. */
			code: 'behavior-description-left-out'
			source: Scl.Ref<'BehaviorDescription'>
			reason: 'partly-mapped'
	  }
	| {
			/** A logical node supervising subscriptions, or the capability declaring that such nodes exist: not written. */
			code: 'supervision-left-out'
			source: Scl.Ref<'LN' | 'SupSubscription'>
	  }
	| {
			/**
			 * An input written in later-binding form without what a later binding needs: written as it is. For an ISD: `desc`,
			 * `intAddr`, `pDO` and a `serviceType` from itself or its `pServT`; for a real IED's file: `desc`, `intAddr` and `pDO`.
			 */
			code: 'input-incomplete'
			source: Scl.Ref<'ExtRef'>
			missing: string[]
	  }
	| {
			/** An input bound to an IED the file does not hold, with no internal address (made by a system tool): not written. */
			code: 'input-removed'
			source: Scl.Ref<'ExtRef'>
			/** The IED it names, when it names one by name rather than by uuid only. */
			iedName?: string
	  }
	| {
			/** An input or output bound to an IED the file does not hold: written without its source, the `attributes` removed. */
			code: 'input-unbound'
			source: Scl.Ref<'ExtRef' | 'ExtCtrl'>
			/** The IED it names, when it names one by name rather than by uuid only. */
			iedName?: string
			attributes: string[]
	  }
	| {
			/** An input or output bound to an IED the file does not hold: written with its whole binding, as the project holds it. */
			code: 'input-bound-outside'
			source: Scl.Ref<'ExtRef' | 'ExtCtrl'>
			/** The IED it names, when it names one by name rather than by uuid only. */
			iedName?: string
	  }
	| {
			/** The LNodes of the substation part the IED implements, the file not holding that part: its tool keeps their logical nodes. */
			code: 'bound-lnodes-not-carried'
			ied: Scl.Ref<'IED'>
			lnodes: Scl.Ref<'LNode'>[]
	  }
	| {
			/** A receiver, report client, association or key distribution entry naming an IED the file does not hold: kept. */
			code: 'ied-reference-dangling'
			source: Scl.Ref<'IEDName' | 'ClientLN' | 'Association' | 'KDC'>
			iedName: string
	  }
	| {
			/** A member of a data set a sending IED sends naming a logical node that IED does not hold: written as it is. */
			code: 'data-set-member-unresolved'
			source: Scl.Ref<'FCDA'>
	  }
	| {
			/** A logical node supervising a control block the file does not hold (or that nothing names): kept as it is. */
			code: 'supervision-source-absent'
			source: Scl.Ref<'LN'>
			reference: string
	  }
	| {
			code: 'ied-reference-left-out'
			source: Scl.Ref<'IEDName' | 'ClientLN' | 'Association' | 'KDC'>
			iedName: string
	  }
	| {
			/**
			 * An IED an LNode of the scope is tied to that the selection leaves out: an LNode it implements is written released
			 * (it may then name a carried specification IED its specified naming gives), one it only specifies stays as bound.
			 */
			code: 'ied-not-carried'
			ied: Scl.Ref<'IED'>
			name: string
			kind: IedKind
			assignment: BoundIedAssignment
	  }
	| {
			/**
			 * An input or an output of a carried IED naming an IED not carried by name: written with its signal names, its uuids
			 * and the control block it names removed (an expected signal). An output is listed under the same code.
			 */
			code: 'external-input'
			source: Scl.Ref<'ExtRef' | 'ExtCtrl'>
			iedName?: string
	  }
	| {
			/** An SCD written without the addresses of its connections (`addresses: 'drop'`): not a complete SCD. */
			code: 'scd-incomplete'
	  }
	| {
			/** A connection, GSE or SMV of a carried IED whose address is not written. */
			code: 'address-not-carried'
			source: Scl.Ref<'ConnectedAP' | 'GSE' | 'SMV'>
	  }
	| {
			/**
			 * A variable or a behaviour description written elsewhere than in the copy of the element holding it (`from`, its
			 * tag), on `to`: what its relative paths start from moved.
			 */
			code: 'satellite-moved'
			element: Scl.Ref<Scl.ElementsOf>
			from: string
			to: string
	  }
	| {
			/** A variable or a behaviour description numbered beside a sibling of its `name`, `as`: what names it by name names another. */
			code: 'satellite-renamed'
			element: Scl.Ref<Scl.ElementsOf>
			name: string
			as: string
	  }
	| {
			/**
			 * A variable a role of an application refers to that applies to nothing the file holds: the extract places
			 * neither it nor the role's reference to it.
			 */
			code: 'satellite-not-placed'
			/** The source's variable. */
			source: Scl.Ref<Scl.ElementsOf>
	  }

/** Whether an IED of a kind or assignment is carried by an SSD extract. */
export type CarryChoice = 'carry' | 'leave-out'

/** Which IEDs an SSD extract carries, by kind and assignment: carried when its kind's choice is `carry` and it is fully assigned to the scope or `shared` is `carry`. */
export type IedSelectionRule = {
	specification: CarryChoice
	implemented: CarryChoice
	shared: CarryChoice
}

/** Which IEDs an SSD extract carries: a rule, or exactly the IEDs listed (each tied to an LNode of the scope). */
export type IedSelection = IedSelectionRule | readonly Scl.Ref<'IED'>[]

/** The file type an SSD extract writes: given, or `'by-content'` (an SCD when it carries an implemented IED, else an SSD). */
export type SsdExtractFileType = 'SSD' | 'SCD' | 'by-content'

/** Whether the addresses of the carried IEDs' connections, GSE and SMV are written. */
export type AddressChoice = 'drop' | 'keep'

/** The options of an SSD extract about the IEDs it carries. */
export type SsdExtractOptions = {
	/** Which IEDs ride: default every IED an LNode of the scope is tied to. */
	ieds?: IedSelection
	/** The file type written: default `'SSD'`. */
	fileType?: SsdExtractFileType
	/** The addresses of the carried IEDs: default kept in an SCD (a complete SCD needs them), left out of an SSD. */
	addresses?: AddressChoice
}

/** What an SSD extract returns: its warnings and the file type it wrote. */
export type SsdExtractResult = {
	warnings: ExtractWarning[]
	fileType: 'SSD' | 'SCD'
}

/** The element an SSD is extracted from: a substation, a voltage level or a bay. */
export type SsdExtractScope = Scl.Ref<'Substation'> | Scl.Ref<'VoltageLevel'> | Scl.Ref<'Bay'>

/**
 * What a function may hold besides its logical nodes and subfunctions, each optional in an FSD: what its logical nodes
 * specify (`dataSpecification`: DOS / SDS / DAS; `inputs`: LNodeInputs; `outputs`: LNodeOutputs), what it holds
 * (`labels`, `processResources`, `powerSystemRelations`, `behaviorDescriptions`, `variables`, `equipment`: its general
 * and conducting equipment), and the `categories` it belongs to.
 */
export type FunctionSection =
	| 'dataSpecification'
	| 'labels'
	| 'inputs'
	| 'outputs'
	| 'processResources'
	| 'powerSystemRelations'
	| 'behaviorDescriptions'
	| 'variables'
	| 'equipment'
	| 'categories'

/** The sections of a function an extract writes: every one unless set `false`. */
export type FunctionSections = { readonly [GenericSection in FunctionSection]?: boolean }

/**
 * Where an FSD holds its function: at the level it sits at in the source, below `TEMPLATE` levels (`source-level`: the
 * highest level it may be placed at); below the `TEMPLATE` substation whatever its level (`substation`); or as a function
 * template with no parent level, which may be placed at every level (`function-template`).
 */
export type FunctionPlacement = 'source-level' | 'substation' | 'function-template'

/** What `extract.fsd` takes besides the common options. */
export type FsdExtractOptions = ExtractOptions & {
	/** The sections of the function written; every one by default. */
	sections?: FunctionSections
	/** Where the FSD holds the function; `source-level` by default. */
	placement?: FunctionPlacement
}

/** What `extract.asd` takes besides the common options. */
export type AsdExtractOptions = ExtractOptions & {
	/** The sections of the functions written: the equipment they hold, kept by default. */
	sections?: Pick<FunctionSections, 'equipment'>
}

/** Where an FSD's function is written: its parent, the `TEMPLATE` levels its categories land at, and its form. */
export type FunctionFrame = {
	parent: Scl.Ref<'Substation'> | Scl.Ref<'VoltageLevel'> | Scl.Ref<'Bay'> | Scl.Ref<'SCL'>
	structure: TargetStructure
	/** Written as a function template with no parent level. */
	asTemplate: boolean
}
