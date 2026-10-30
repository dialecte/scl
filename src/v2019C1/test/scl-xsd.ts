import { SCL_XSD_ENTRY_FILE, SCL_XSD_FILE_NAMES, SCL_XSD_FOLDER } from './scl-xsd.constants'
import { HEADER, SCL_ROOT_CHILD_ORDER } from './supply-header.constants'

import type {
	CollectSclXsdViolationsParams,
	SclXsdReport,
	SclXsdSchemaSource,
	SclXsdViolation,
	SuppliedHeader,
} from './scl-xsd.types'
import type { XmlDocument, XmlElement, XsdValidator } from 'libxml2-wasm'

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
	if (!schemaSource) return { ran: false }

	const violations = await validate(params)
	return { ran: true, violations }
}

async function validate(params: CollectSclXsdViolationsParams): Promise<SclXsdViolation[]> {
	const { xml, missingHeader } = params
	const libxml2 = await importLibxml2()
	sclXsdValidator ??= readSclXsdValidator()
	const validator = await sclXsdValidator
	let document: XmlDocument | undefined
	try {
		document = parseToValidate({ libxml2, xml, missingHeader })
		validator.validate(document)
		return []
	} catch (error) {
		if (error instanceof libxml2.XmlLibError) return error.details.map(toViolation)
		throw error
	} finally {
		document?.dispose()
	}
}

/**
 * The document the validator reads: `xml` parsed, given the `missingHeader` when its root has no Header. The Header is
 * added to the parser's tree, never to the text, then that tree is written out and read again: libxml2 sets an
 * attribute of an element in the default namespace in that namespace, which no schema allows, and its writer prints
 * it as the plain attribute the schema asks for.
 */
function parseToValidate(params: {
	libxml2: typeof import('libxml2-wasm')
	xml: string
	missingHeader: CollectSclXsdViolationsParams['missingHeader']
}): XmlDocument {
	const { libxml2, xml, missingHeader } = params
	const parsed = libxml2.XmlDocument.fromString(xml)
	if (!missingHeader || !supplyHeader({ libxml2, root: parsed.root, header: missingHeader })) {
		return parsed
	}
	const withHeader = parsed.toString({ format: false })
	parsed.dispose()
	return libxml2.XmlDocument.fromString(withHeader)
}

/**
 * Give the parsed root the Header it lacks, where the schema places it: before its first child the schema puts after
 * the Header, else last. Whether it added one.
 */
function supplyHeader(params: {
	libxml2: typeof import('libxml2-wasm')
	root: XmlElement
	header: SuppliedHeader
}): boolean {
	const { libxml2, root, header } = params
	const children: XmlElement[] = []
	for (let child = root.firstChild; child; child = child.next) {
		if (child instanceof libxml2.XmlElement) children.push(child)
	}
	if (children.some((child) => child.name === HEADER)) return false

	const headerPosition = SCL_ROOT_CHILD_ORDER.indexOf(HEADER)
	const next = children.find((child) => SCL_ROOT_CHILD_ORDER.indexOf(child.name) > headerPosition)
	const prefix = root.prefix || undefined
	const added = next ? next.prependElement(HEADER, prefix) : root.addElement(HEADER, prefix)
	added.setAttr('id', header.id)
	added.setAttr('uuid', header.uuid)
	return true
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
