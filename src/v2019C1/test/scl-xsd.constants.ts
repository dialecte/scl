/**
 * The schema file a document is validated against. The 6-100 schema imports the SCL schema, so one entry checks the
 * SCL content and, under a `Private`, every 6-100 element the 6-100 schema declares globally.
 */
export const SCL_XSD_ENTRY_FILE = 'IEC61850-6-100.xsd'

/**
 * The schema files the validator reads, by the names their includes and imports use: the SCL schema of the 2007 C5
 * edition with its parts, and the 6-100 schema. They are not shipped with the package (their licence is the IEC's):
 * {@link configureSclXsdSchemas} says where they are.
 */
export const SCL_XSD_FILE_NAMES: readonly string[] = [
	'IEC61850-6-100.xsd',
	'SCL.xsd',
	'SCL_BaseSimpleTypes.xsd',
	'SCL_BaseTypes.xsd',
	'SCL_Communication.xsd',
	'SCL_DataTypeTemplates.xsd',
	'SCL_Enums.xsd',
	'SCL_IED.xsd',
	'SCL_Substation.xsd',
]

/** The folder name the schema files are registered under, so their includes and imports resolve to each other. */
export const SCL_XSD_FOLDER = 'scl-xsd'

/** Where this package's tests find the schema files, from the package root (synced, not committed). */
export const SCL_XSD_FIXTURE_FOLDER = 'src/v2019C1/test/fixtures/xsd'

/** A row of the fixture folder's README: a schema file and its sha256. */
export const SCL_XSD_README_ROW = /^\|\s*`([^`]+\.xsd)`\s*\|\s*`([0-9a-f]{64})`\s*\|$/

/**
 * Where the schema files are synced from by default: the folder of the sibling create package, from the root of the
 * repository checkout (the main checkout of a worktree), which holds them uncommitted too.
 */
export const SCL_XSD_SIBLING_SOURCE = '../create/xsd/SCL'
