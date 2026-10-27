import type { Scl } from '@/v2019C1/config'
import type { FileStart } from '@/v2019C1/extensions/history/transaction/start-file.types'

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
	 * The element extracted (the function, the application, the level) loses its template link (`'break'`, default:
	 * its `templateUuid`, `originUuid` and its own file reference go), or keeps it (`'keep'`). What it holds keeps its
	 * lineage either way.
	 */
	templateLink?: TemplateLink
}

/**
 * What an extract left out and says so: `sections-not-carried` — the `IED` and `Communication` sections of the source,
 * which an SSD does not carry yet, with their count.
 */
export type ExtractWarning = {
	code: 'sections-not-carried'
	counts: { IED: number; Communication: number }
}

/** The element an SSD is extracted from: a substation, a voltage level or a bay. */
export type SsdExtractScope = Scl.Ref<'Substation'> | Scl.Ref<'VoltageLevel'> | Scl.Ref<'Bay'>

/** The levels of an extracted SSD's frame, by source record id: the TEMPLATE-named scaffolding, the named units below. */
export type TemplateFrame = {
	scaffoldingIds: readonly string[]
	unitIds: readonly string[]
}

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

/** What `extract.fsd` takes besides the common options. */
export type FsdExtractOptions = ExtractOptions & {
	/** The sections of the function written; every one by default. */
	sections?: FunctionSections
}

/** What `extract.asd` takes besides the common options. */
export type AsdExtractOptions = ExtractOptions & {
	/** The sections of the functions written: the equipment they hold, kept by default. */
	sections?: Pick<FunctionSections, 'equipment'>
}
