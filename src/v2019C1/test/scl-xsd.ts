import { SCL_XSD_ENTRY_FILE, SCL_XSD_FILE_NAMES, SCL_XSD_FOLDER } from './scl-xsd.constants'

import type {
	CollectSclXsdViolationsParams,
	SclXsdReport,
	SclXsdSchemaSource,
	SclXsdViolation,
} from './scl-xsd.types'
import type { XsdValidator } from 'libxml2-wasm'

/** Where the schema files are, as the test setup says. */
let schemaSource: SclXsdSchemaSource | undefined

/** Parsed once per worker, on the first validation: parsing the schema set costs tens of milliseconds. */
let sclXsdValidator: Promise<XsdValidator> | undefined

/**
 * Say where the SCL schema files are, once, in a setup file of the test project, before any test validates: the
 * output check of the test helpers validates every document a test leaves against them. The files are not shipped
 * with the package.
 */
export function configureSclXsdSchemas(source: SclXsdSchemaSource): void {
	schemaSource = source
	sclXsdValidator = undefined
}

/** Whether the schema files are configured: the XSD validator runs only then. */
export function isSclXsdConfigured(): boolean {
	return schemaSource !== undefined
}

/**
 * Every finding of an XSD validator (libxml2) on `xml`, checked against the SCL schema and the 6-100 schema: value
 * patterns and enumerations, required attributes and children, unique keys and key references. No finding when the
 * document is valid; a document that does not parse gives the parser's messages. When the schema files are not
 * configured the validator does not run, and the report says so (`ran: false`).
 */
export async function collectSclXsdViolations(
	params: CollectSclXsdViolationsParams,
): Promise<SclXsdReport> {
	const { xml } = params
	if (!schemaSource) return { ran: false }

	const violations = await validate({ xml })
	return { ran: true, violations }
}

async function validate(params: { xml: string }): Promise<SclXsdViolation[]> {
	const { xml } = params
	const libxml2 = await importLibxml2()
	sclXsdValidator ??= readSclXsdValidator()
	const validator = await sclXsdValidator
	let document: InstanceType<typeof libxml2.XmlDocument> | undefined
	try {
		document = libxml2.XmlDocument.fromString(xml)
		validator.validate(document)
		return []
	} catch (error) {
		if (error instanceof libxml2.XmlLibError) return error.details.map(toViolation)
		throw error
	} finally {
		document?.dispose()
	}
}

async function readSclXsdValidator(): Promise<XsdValidator> {
	if (!schemaSource) throw new Error('The SCL schema files are not configured')
	const libxml2 = await importLibxml2()
	const texts = await readSchemaTexts(schemaSource)

	const encoder = new TextEncoder()
	const buffers = Object.fromEntries(
		SCL_XSD_FILE_NAMES.map((name) => [`${SCL_XSD_FOLDER}/${name}`, encoder.encode(texts[name])]),
	)
	libxml2.xmlRegisterInputProvider(new libxml2.XmlBufferInputProvider(buffers))

	const entry = `${SCL_XSD_FOLDER}/${SCL_XSD_ENTRY_FILE}`
	const schema = libxml2.XmlDocument.fromBuffer(buffers[entry], { url: entry })
	return libxml2.XsdValidator.fromDoc(schema)
}

/** The text of every schema file, by file name; a file the source does not give is refused. */
async function readSchemaTexts(
	source: SclXsdSchemaSource,
): Promise<Readonly<Record<string, string>>> {
	const texts = 'load' in source ? await source.load() : await fetchSchemaTexts(source.baseUrl)
	const missing = SCL_XSD_FILE_NAMES.filter((name) => texts[name] === undefined)
	if (missing.length > 0) throw new Error(`SCL schema files missing: ${missing.join(', ')}`)
	return texts
}

async function fetchSchemaTexts(baseUrl: string): Promise<Record<string, string>> {
	const texts: Record<string, string> = {}
	for (const name of SCL_XSD_FILE_NAMES) {
		const response = await fetch(`${baseUrl.replace(/\/$/, '')}/${name}`)
		if (response.ok) texts[name] = await response.text()
	}
	return texts
}

/** The validator, loaded on the first validation: an optional peer dependency of the package. */
async function importLibxml2(): Promise<typeof import('libxml2-wasm')> {
	try {
		return await import('libxml2-wasm')
	} catch (error) {
		throw new Error(
			'The output check of the SCL test helpers needs libxml2-wasm: install it as a dev dependency',
			{ cause: error },
		)
	}
}

function toViolation(detail: { message: string; xpath?: string }): SclXsdViolation {
	const message = detail.message.trim()
	return detail.xpath ? { message, xpath: detail.xpath } : { message }
}
