import type { Scl } from '@/v2019C1/config'
import type { FileStart } from '@/v2019C1/extensions/history/transaction/start-file.types'
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
 * What an extract left out or moved and says so: `sections-not-carried` — the `IED` and `Communication` sections of the
 * source, which an SSD does not carry yet, with their count —, a satellite moved, renamed, or not placed.
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
			/** An input written in later-binding form without what a later binding needs (`desc`, `intAddr`, `pDO`): written as it is. */
			code: 'input-incomplete'
			source: Scl.Ref<'ExtRef'>
			missing: string[]
	  }
	| {
			code: 'ied-reference-left-out'
			source: Scl.Ref<'IEDName' | 'ClientLN' | 'Association' | 'KDC'>
			iedName: string
	  }
	| {
			code: 'sections-not-carried'
			counts: { IED: number; Communication: number }
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
