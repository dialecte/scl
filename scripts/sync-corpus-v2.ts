/**
 * Copy the SCL files of the Test System V2 corpus into the test fixtures, where the `corpus` vitest project reads
 * them. The corpus is not published: the target folders are ignored by git.
 *
 * Usage: npm run corpus:sync -- "<path to Test System V2>" [--xsd] [--xsd-from "<path to the xsd folder>"]
 *        (or SCL_CORPUS_V2_SOURCE / SCL_XSD_SOURCE)
 *
 * Every file of the source tree with a corpus extension whose root element is `SCL` is read; folders named `old` (any
 * case) and files of another root (logic exports) are left out. The files are grouped by Header uuid: the latest
 * revision that is not quarantined goes to `v2/` (the smoke), the other revisions to `pairs/` (fork tests), each under
 * its relative path; a byte duplicate is dropped. `MANIFEST.md` lists every family. With `--xsd` the schema files are
 * synced too, from the sibling create package or the `--xsd-from` folder (see sync-xsd.ts).
 */
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
	CORPUS_V2_EXTENSIONS,
	CORPUS_V2_FILES,
	CORPUS_V2_FOLDER,
	CORPUS_V2_LEFT_OUT_FOLDER,
	CORPUS_V2_MANIFEST,
	CORPUS_V2_PAIRS_FOLDER,
	CORPUS_V2_QUARANTINE,
	HEADER_ATTRIBUTE,
	HEADER_ELEMENT,
	ROOT_ELEMENT_WINDOW,
} from '../src/v2019C1/test/corpus/corpus-v2.constants'
import { planCorpusV2 } from '../src/v2019C1/test/corpus/plan-corpus-v2'
import { defaultXsdSource, syncXsd } from './sync-xsd'

import type {
	CorpusV2Entry,
	CorpusV2Family,
	CorpusV2SyncArguments,
} from '../src/v2019C1/test/corpus/corpus-v2.types'

function main(): void {
	const { source, xsdSource } = readArguments(process.argv.slice(2))
	if (xsdSource) syncXsd({ source: xsdSource })

	const entries = listCorpusFiles({ root: source, folder: '' }).map((file) =>
		readEntry({ root: source, file }),
	)
	const families = planCorpusV2({
		entries,
		quarantined: (file) => CORPUS_V2_QUARANTINE[file] !== undefined,
	})

	const smokeFolder = fromPackageRoot(CORPUS_V2_FOLDER)
	const pairsFolder = fromPackageRoot(CORPUS_V2_PAIRS_FOLDER)
	rmSync(smokeFolder, { recursive: true, force: true })
	rmSync(pairsFolder, { recursive: true, force: true })
	for (const family of families) {
		copyInto({ root: source, file: family.smoke.path, folder: smokeFolder })
		for (const pair of family.pairs)
			copyInto({ root: source, file: pair.path, folder: pairsFolder })
	}
	writeFileSync(fromPackageRoot(CORPUS_V2_MANIFEST), manifestOf(families))

	const smokeFiles = families.map((family) => family.smoke.path)
	const pairs = families.flatMap((family) => family.pairs)
	const duplicates = families.flatMap((family) => family.duplicates)
	const sameRevision = families.flatMap((family) => family.sameRevision)
	if (sameRevision.length > 0) {
		console.warn(
			`files of one revision with other bytes, the smoke one chosen by the copy order:\n  ${sameRevision.map((entry) => entry.path).join('\n  ')}`,
		)
	}
	console.info(
		`corpus V2: ${entries.length} SCL files, ${families.length} families: ${smokeFiles.length} in the smoke, ${pairs.length} pairs, ${duplicates.length} duplicates dropped`,
	)
	const listed = new Set(CORPUS_V2_FILES)
	const unlisted = smokeFiles.filter((file) => !listed.has(file))
	const missing = [...listed].filter((file) => !smokeFiles.includes(file))
	if (unlisted.length > 0) console.warn(`not in CORPUS_V2_FILES:\n  ${unlisted.join('\n  ')}`)
	if (missing.length > 0)
		console.warn(`in CORPUS_V2_FILES, not a smoke file:\n  ${missing.join('\n  ')}`)
}

/**
 * The corpus folder (the argument, or SCL_CORPUS_V2_SOURCE) and the schema folder: `--xsd-from`, SCL_XSD_SOURCE, or the
 * sibling create package with `--xsd`; none without either flag or the variable.
 */
function readArguments(argv: readonly string[]): CorpusV2SyncArguments {
	const fromFlag = argv.indexOf('--xsd-from')
	if (
		fromFlag !== -1 &&
		(argv[fromFlag + 1] === undefined || argv[fromFlag + 1].startsWith('--'))
	) {
		throw new Error('--xsd-from needs the path to the xsd folder')
	}
	const fromIndexes = fromFlag === -1 ? [] : [fromFlag, fromFlag + 1]
	const optionIndexes = new Set(
		[...fromIndexes, argv.indexOf('--xsd')].filter((index) => index >= 0),
	)
	const source =
		argv.filter((_, index) => !optionIndexes.has(index))[0] ?? process.env.SCL_CORPUS_V2_SOURCE
	if (!source) {
		throw new Error(
			'Give the corpus folder: npm run corpus:sync -- "<path to Test System V2>" (or SCL_CORPUS_V2_SOURCE)',
		)
	}
	const fromFolder = fromFlag === -1 ? process.env.SCL_XSD_SOURCE : argv[fromFlag + 1]
	const xsdSource = fromFolder ?? (argv.includes('--xsd') ? defaultXsdSource() : undefined)
	return { source, xsdSource }
}

function fromPackageRoot(folder: string): string {
	return fileURLToPath(new URL(`../${folder}`, import.meta.url))
}

function copyInto(params: { root: string; file: string; folder: string }): void {
	const { root, file, folder } = params
	const destination = path.join(folder, file)
	mkdirSync(path.dirname(destination), { recursive: true })
	copyFileSync(path.join(root, file), destination)
}

/** The relative paths of the SCL files under `folder`, sorted. */
function listCorpusFiles(params: { root: string; folder: string }): string[] {
	const { root, folder } = params
	const entries = readdirSync(path.join(root, folder), { withFileTypes: true })
	return entries
		.flatMap((entry) => {
			const relative = folder ? `${folder}/${entry.name}` : entry.name
			if (entry.isDirectory()) {
				return entry.name.toLowerCase() === CORPUS_V2_LEFT_OUT_FOLDER
					? []
					: listCorpusFiles({ root, folder: relative })
			}
			return isSclFile({ root, file: relative }) ? [relative] : []
		})
		.sort()
}

function isSclFile(params: { root: string; file: string }): boolean {
	const { root, file } = params
	const extension = path.extname(file).slice(1).toLowerCase()
	if (!CORPUS_V2_EXTENSIONS.includes(extension)) return false
	const head = readFileSync(path.join(root, file)).subarray(0, ROOT_ELEMENT_WINDOW).toString('utf8')
	return rootElementOf(head) === 'SCL'
}

/** The name of the first element of an XML text, past its declaration and comments. */
function rootElementOf(head: string): string | undefined {
	const content = head.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g, '')
	return /<([A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)[\s/>]/.exec(content)?.[2]
}

/** A file and its Header: a file without one is a family of its own, named by its path. */
function readEntry(params: { root: string; file: string }): CorpusV2Entry {
	const { root, file } = params
	const bytes = readFileSync(path.join(root, file))
	const header = HEADER_ELEMENT.exec(bytes.toString('utf8'))?.[1] ?? ''
	const attributes = Object.fromEntries(
		[...header.matchAll(HEADER_ATTRIBUTE)].map(([, name, value]) => [name, value]),
	)
	return {
		path: file,
		headerUuid: attributes.uuid || `no header uuid: ${file}`,
		version: attributes.version ?? '',
		revision: attributes.revision ?? '',
		sha256: createHash('sha256').update(bytes).digest('hex'),
	}
}

function manifestOf(families: readonly CorpusV2Family[]): string {
	const rows = families.map((family) => {
		const files = [family.smoke, ...family.pairs, ...family.duplicates]
		const versions = files.map((entry) => `${entry.version}/${entry.revision}`).join(', ')
		const quarantine = CORPUS_V2_QUARANTINE[family.smoke.path]?.reason ?? ''
		return `| \`${family.headerUuid}\` | ${versions} | \`${family.smoke.path}\` | ${pathsCell(family.pairs)} | ${pathsCell(family.duplicates)} | ${pathsCell(family.sameRevision)} | ${quarantine} |`
	})
	return [
		'# Corpus V2 manifest',
		'',
		'Written by `npm run corpus:sync`. One row per family (one Header uuid): the file the smoke runs (`v2/`), the',
		"revisions kept for fork tests (`pairs/`), the byte duplicates dropped, the pairs of the smoke file's revision",
		'with other bytes (which one is the latest is not known), and the quarantine of the smoke file.',
		'',
		'| Header uuid | Versions (version/revision) | Smoke | Pairs | Duplicates dropped | Same revision as the smoke | Quarantine |',
		'| ----------- | --------------------------- | ----- | ----- | ------------------ | -------------------------- | ---------- |',
		...rows,
		'',
	].join('\n')
}

function pathsCell(entries: readonly CorpusV2Entry[]): string {
	return entries.map((entry) => `\`${entry.path}\``).join('<br>')
}

main()
