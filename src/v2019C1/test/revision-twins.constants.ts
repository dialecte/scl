/// <reference types="vite/client" />

/** Where the revision twins sit, as the glob below names them. */
export const REVISION_TWIN_FOLDER = './fixtures/revisions/'

/**
 * The revision twins, by their path: small copies of the revision pairs of the real-file corpus, committed with the
 * tests (see the folder's README), each in its two revisions.
 */
export const REVISION_TWIN_FILES: Readonly<Record<string, string>> = import.meta.glob<string>(
	'./fixtures/revisions/*.{asd,ssd,fsd}',
	{ query: '?raw', import: 'default', eager: true },
)

/** Each twin: the name its two revisions share, and the extension of its kind of file. */
export const REVISION_TWINS = {
	/** An application that renames three of its subfunctions and changes its type. */
	applicationRenamesFunctions: { name: 'application-renames-functions', extension: 'asd' },
	/** An application that gains a function role and a behaviour description. */
	applicationGainsElements: { name: 'application-gains-elements', extension: 'asd' },
	/** A function whose logical node type gains a data object. */
	functionTypeGainsData: { name: 'function-type-gains-data', extension: 'fsd' },
	/** A bay template of two levels, built from the two applications, that gains a dataflow between them. */
	twoLevelBayTemplate: { name: 'two-level-bay-template', extension: 'ssd' },
	/** An application with two groups of variants that changes inside and outside what an instance selects. */
	variantApplication: { name: 'variant-application', extension: 'asd' },
} as const

/**
 * The twins whose project instance is committed beside them (`<name>.instance.<extension>`): a project holding an
 * instance of the first revision the way a tool left it.
 */
export const REVISION_TWIN_INSTANCES = {
	/** The project holding the application's instance with one variant of each group selected. */
	variantApplication: { extension: 'ssd' },
} as const
