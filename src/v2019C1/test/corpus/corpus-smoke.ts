import { collectReferenceViolations } from '../assert-coherent-scl-references'
import { collectSclOutputViolations } from '../assert-scl-output'
import { assertValidSclXml } from '../assert-valid-scl-xml'
import { SCL_TEST_SETUP } from '../scl-test-setup.constants'
import { collectSclXsdViolations, isSclXsdConfigured } from '../scl-xsd'
import { CORPUS_LOADERS } from './corpus-loaders.constants'
import { CORPUS_EXPECTED_DIAGNOSTICS, CORPUS_FILES, CORPUS_KIND_FOLDERS } from './corpus.constants'

import { Project } from '@dialecte/core'
import { describe, expect, it } from 'vitest'

import type {
	CorpusFileCheckParams,
	CorpusKind,
	ImportDiagnosticCounts,
	RunCorpusSmokeParams,
} from './corpus.types'
import type { Config } from '@/v2019C1/config/dialecte.config'
import type { Diagnostic } from '@dialecte/core'

/**
 * Two cases per corpus file of `kind`. The file: valid by structure, by the XSD validator and for coherent
 * references. Its import and export: it imports with the diagnostics it is known to give, the imported document holds
 * nothing a real file could not, its export is a fixed point (exported, imported again and exported, it does not
 * change), and the export keeps every uuid and every element of the file. Every smoke file must pass both.
 * Skipped when the corpus is not synced.
 */
export function runCorpusSmoke(params: RunCorpusSmokeParams): void {
	const { kind } = params
	const files = CORPUS_FILES.filter((file) => kindOf(file) === kind)

	describe.skipIf(!isCorpusSynced())(`corpus — ${kind}`, () => {
		for (const file of files) {
			it(`${file} › the file`, async function checkFile() {
				const xml = await readCorpusFile(file)
				await assertCorpusFileValid({ file, xml })
			})
			it(`${file} › import and export`, async function checkImportAndExport() {
				const xml = await readCorpusFile(file)
				await assertCorpusFileImport({ file, xml })
			})
		}
	})
}

/** The files the glob finds and the list, compared: nothing synced unlisted, nothing listed missing, every file of a kind. */
export function assertCorpusListing(): void {
	expect(Object.keys(CORPUS_LOADERS).sort()).toEqual([...CORPUS_FILES].sort())
	expect(CORPUS_FILES.filter((file) => kindOf(file) === undefined)).toEqual([])
}

/** Whether the corpus and the schema files are synced: its cases run only then (the file check is the validator's). */
export function isCorpusSynced(): boolean {
	return Object.keys(CORPUS_LOADERS).length > 0 && isSclXsdConfigured()
}

function kindOf(file: string): CorpusKind | undefined {
	const kinds = Object.entries(CORPUS_KIND_FOLDERS) as [CorpusKind, string][]
	return kinds.find(([, folder]) => file.startsWith(folder))?.[0]
}

async function readCorpusFile(file: string): Promise<string> {
	const load = CORPUS_LOADERS[file]
	if (!load) throw new Error(`${file}: not synced`)
	return load()
}

/** The check of a corpus file itself: its structure, the XSD validator, its references. Throws on the first that fails. */
export async function assertCorpusFileValid(params: CorpusFileCheckParams): Promise<void> {
	const { file, xml } = params
	assertValidSclXml(xml, file, { requireComplete: false })
	const xsd = await collectSclXsdViolations({ xml })
	expect(xsd, 'the XSD validator on the file').toEqual({ ran: true, violations: [] })
	expect(collectReferenceViolations({ xml }), 'the references of the file').toEqual([])
}

/**
 * The check of a corpus file's import and export: its known diagnostics, an imported document holding no violation, an
 * export that is a fixed point and keeps every uuid and element. Throws on the first that fails.
 */
export async function assertCorpusFileImport(params: CorpusFileCheckParams): Promise<void> {
	const { file, xml } = params

	const corpus = await openCorpusProject()
	try {
		const imported = await corpus.importXml({ xml, fileName: fileNameOf(file) })
		expect(countDiagnostics(imported.diagnostics), 'the import diagnostics').toEqual(
			CORPUS_EXPECTED_DIAGNOSTICS[file] ?? {},
		)

		const { violations } = await collectSclOutputViolations({
			project: corpus.project,
			document: imported.document,
		})
		expect(
			violations.map((violation) => violation.description),
			'the imported document',
		).toEqual([])

		const firstExport = await corpus.exportXml(imported.documentId)
		const reimported = await corpus.importXml({ xml: firstExport, fileName: fileNameOf(file) })
		const secondExport = await corpus.exportXml(reimported.documentId)
		expect(canonicalXml(secondExport), 'export, import, export: a fixed point').toBe(
			canonicalXml(firstExport),
		)

		expect(missingUuids({ from: xml, in: firstExport }), 'uuids the export lost').toEqual([])
		expect(lostElements({ from: xml, in: firstExport }), 'elements the export lost').toEqual({})
	} finally {
		await corpus.project.destroy()
	}
}

/** A project opened as an application opens one: each import answers its file's diagnostics. */
async function openCorpusProject() {
	const project = await new Project<Config, typeof SCL_TEST_SETUP.extensions.base>({
		configs: { default: SCL_TEST_SETUP.dialecteConfig },
		defaultConfigKey: 'default',
		storage: { type: 'local' },
		extensions: SCL_TEST_SETUP.extensions,
		hooks: SCL_TEST_SETUP.hooks,
	}).open(`corpus-${crypto.randomUUID()}`)

	async function importXml(params: { xml: string; fileName: string }) {
		const { xml, fileName } = params
		const file = new File([xml], fileName, { type: 'application/xml' })
		const [entry] = await project.import([file])
		if (entry.status === 'failed') throw entry.error
		return {
			documentId: entry.documentId,
			document: project.openDocument(entry.documentId),
			diagnostics: entry.diagnostics,
		}
	}

	async function exportXml(documentId: string): Promise<string> {
		const { xmlDocument } = await project.export(documentId, { withDatabaseIds: false })
		return new XMLSerializer().serializeToString(xmlDocument)
	}

	return { project, importXml, exportXml }
}

function countDiagnostics(diagnostics: readonly Diagnostic[]): ImportDiagnosticCounts {
	const counts: Record<string, number> = {}
	for (const { code } of diagnostics) counts[code] = (counts[code] ?? 0) + 1
	return counts
}

function fileNameOf(file: string): string {
	return file.slice(file.lastIndexOf('/') + 1)
}

/** The uuids of `from` that `in` does not hold. */
function missingUuids(params: { from: string; in: string }): string[] {
	const kept = new Set(uuidsOf(params.in))
	return uuidsOf(params.from).filter((uuid) => !kept.has(uuid))
}

function uuidsOf(xml: string): string[] {
	const document = new DOMParser().parseFromString(xml, 'application/xml')
	return [...document.querySelectorAll('[uuid]')].map(
		(element) => element.getAttribute('uuid') ?? '',
	)
}

/** The tags `in` holds fewer of than `from`, with how many it lost. */
function lostElements(params: { from: string; in: string }): Record<string, number> {
	const before = countTags(params.from)
	const after = countTags(params.in)
	return Object.fromEntries(
		Object.entries(before)
			.map(([tag, count]): [string, number] => [tag, count - (after[tag] ?? 0)])
			.filter(([, lost]) => lost > 0),
	)
}

function countTags(xml: string): Record<string, number> {
	const document = new DOMParser().parseFromString(xml, 'application/xml')
	const counts: Record<string, number> = {}
	for (const element of document.getElementsByTagName('*')) {
		counts[element.localName] = (counts[element.localName] ?? 0) + 1
	}
	return counts
}

/** The XML with the attributes of every element in name order: their order carries no meaning. */
function canonicalXml(xml: string): string {
	const document = new DOMParser().parseFromString(xml, 'application/xml')
	for (const element of document.getElementsByTagName('*')) {
		const attributes = [...element.attributes].sort((left, right) =>
			left.name.localeCompare(right.name),
		)
		for (const attribute of attributes) element.removeAttributeNode(attribute)
		for (const attribute of attributes) element.setAttributeNodeNS(attribute)
	}
	return new XMLSerializer().serializeToString(document)
}
