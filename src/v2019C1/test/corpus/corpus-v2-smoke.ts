import { collectReferenceViolations } from '../assert-coherent-scl-references'
import { collectSclOutputViolations } from '../assert-scl-output'
import { assertValidSclXml } from '../assert-valid-scl-xml'
import { SCL_TEST_SETUP } from '../scl-test-setup.constants'
import { collectSclXsdViolations, isSclXsdConfigured } from '../scl-xsd'
import { CORPUS_V2_LOADERS } from './corpus-v2-loaders.constants'
import {
	CORPUS_V2_ENGINE_DEFECTS,
	CORPUS_V2_EXPECTED_WARNINGS,
	CORPUS_V2_FILES,
	CORPUS_V2_KIND_FOLDERS,
	CORPUS_V2_QUARANTINE,
} from './corpus-v2.constants'

import { Project } from '@dialecte/core'
import { describe, expect, it } from 'vitest'

import { createSclIoHooks } from '@/v2019C1/hooks'

import type { CorpusV2Kind, ImportWarningCounts, RunCorpusV2SmokeParams } from './corpus-v2.types'
import type { Config } from '@/v2019C1/config/dialecte.config'
import type { ImportWarning } from '@dialecte/core'

/**
 * Two cases per corpus file of `kind`. The file: valid by structure, by the XSD validator and for coherent
 * references. Its import and export: it imports with the warnings it is known to give, the imported document holds
 * nothing a real file could not (a quarantined file aside: it is not valid to begin with), its export is a fixed point
 * (exported, imported again and exported, it does not change), and the export keeps every uuid and every element of
 * the file. A check a quarantine or a known engine defect fails runs as an expected failure. Skipped when the corpus
 * is not synced.
 */
export function runCorpusV2Smoke(params: RunCorpusV2SmokeParams): void {
	const { kind } = params
	const files = CORPUS_V2_FILES.filter((file) => kindOf(file) === kind)

	describe.skipIf(!isCorpusV2Synced())(`corpus V2 — ${kind}`, () => {
		for (const file of files) {
			const quarantine = CORPUS_V2_QUARANTINE[file]
			const engineDefect = CORPUS_V2_ENGINE_DEFECTS[file]
			const note = quarantine ? `quarantined: ${quarantine.reason}` : engineDefect?.reason

			const fileFails =
				quarantine?.fileCheck === 'fails' || engineDefect?.failingChecks.includes('file') === true
			const importFails = engineDefect?.failingChecks.includes('import') === true

			caseOf({ fails: fileFails })(
				caseName({ file, check: 'the file', note }),
				async function checkFile() {
					await assertCorpusFileValid({ file })
				},
			)
			caseOf({ fails: importFails })(
				caseName({ file, check: 'import and export', note }),
				async function checkImportAndExport() {
					await assertCorpusFileImport({ file, imported: quarantine ? 'as read' : 'valid' })
				},
			)
		}
	})
}

/** The files the glob finds and the list, compared: nothing synced unlisted, nothing listed missing, every file of a kind. */
export function assertCorpusV2Listing(): void {
	expect(Object.keys(CORPUS_V2_LOADERS).sort()).toEqual([...CORPUS_V2_FILES].sort())
	expect(CORPUS_V2_FILES.filter((file) => kindOf(file) === undefined)).toEqual([])
}

/** Whether the corpus and the schema files are synced: its cases run only then (the file check is the validator's). */
export function isCorpusV2Synced(): boolean {
	return Object.keys(CORPUS_V2_LOADERS).length > 0 && isSclXsdConfigured()
}

function kindOf(file: string): CorpusV2Kind | undefined {
	const kinds = Object.entries(CORPUS_V2_KIND_FOLDERS) as [CorpusV2Kind, string][]
	return kinds.find(([, folder]) => file.startsWith(folder))?.[0]
}

function caseOf(params: { fails: boolean }) {
	return params.fails ? it.fails : it
}

function caseName(params: { file: string; check: string; note: string | undefined }): string {
	const { file, check, note } = params
	return note ? `${file} › ${check} — ${note}` : `${file} › ${check}`
}

async function readCorpusFile(file: string): Promise<string> {
	const load = CORPUS_V2_LOADERS[file]
	if (!load) throw new Error(`${file}: not synced`)
	return load()
}

async function assertCorpusFileValid(params: { file: string }): Promise<void> {
	const { file } = params
	const xml = await readCorpusFile(file)
	assertValidSclXml(xml, file, { requireComplete: false })
	const xsd = await collectSclXsdViolations({ xml })
	expect(xsd, 'the XSD validator on the file').toEqual({ ran: true, violations: [] })
	expect(collectReferenceViolations({ xml }), 'the references of the file').toEqual([])
}

async function assertCorpusFileImport(params: {
	file: string
	/** `valid`: the imported document holds no violation; `as read`: it is not checked (the file is not valid). */
	imported: 'valid' | 'as read'
}): Promise<void> {
	const { file, imported: importedBar } = params
	const xml = await readCorpusFile(file)

	const corpus = await openCorpusProject()
	try {
		const imported = await corpus.importXml({ xml, fileName: fileNameOf(file) })
		expect(countWarnings(imported.warnings), 'the import warnings').toEqual(
			CORPUS_V2_EXPECTED_WARNINGS[file] ?? {},
		)

		if (importedBar === 'valid') {
			const { violations } = await collectSclOutputViolations({
				project: corpus.project,
				document: imported.document,
			})
			expect(
				violations.map((violation) => violation.description),
				'the imported document',
			).toEqual([])
		}

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

/** A project opened as an application opens one, keeping aside the warnings each import gives. */
async function openCorpusProject() {
	const warnings: ImportWarning[] = []
	const ioHooks = createSclIoHooks()
	const afterImport = ioHooks.afterImport
	const project = await new Project<Config, typeof SCL_TEST_SETUP.extensions.base>({
		configs: { default: SCL_TEST_SETUP.dialecteConfig },
		defaultConfigKey: 'default',
		storage: { type: 'local' },
		extensions: SCL_TEST_SETUP.extensions,
		hooks: {
			...SCL_TEST_SETUP.hooks,
			...ioHooks,
			async afterImport() {
				const result = afterImport ? await afterImport() : {}
				warnings.push(...(result.warnings ?? []))
				return result
			},
		},
	}).open(`corpus-${crypto.randomUUID()}`)

	async function importXml(params: { xml: string; fileName: string }) {
		const { xml, fileName } = params
		const before = warnings.length
		const file = new File([xml], fileName, { type: 'application/xml' })
		const [result] = await project.import([file])
		return {
			documentId: result.documentId,
			document: project.openDocument(result.documentId),
			warnings: warnings.slice(before),
		}
	}

	async function exportXml(documentId: string): Promise<string> {
		const { xmlDocument } = await project.export(documentId, { withDatabaseIds: false })
		return new XMLSerializer().serializeToString(xmlDocument)
	}

	return { project, importXml, exportXml }
}

function countWarnings(warnings: readonly ImportWarning[]): ImportWarningCounts {
	const counts: Record<string, number> = {}
	for (const { type } of warnings) counts[type] = (counts[type] ?? 0) + 1
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
