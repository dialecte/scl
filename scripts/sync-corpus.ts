/**
 * Copy the SCL files of the expert's test system into the test fixtures, where the `corpus` vitest project reads them.
 * The corpus is not published: the target folders are ignored by git.
 *
 * Usage: npm run corpus:sync -- "<source folder>" [--xsd] [--xsd-from "<path to the xsd folder>"]
 *        npm run corpus:check-excluded -- "<source folder>"   (as corpus:sync -- --check-excluded)
 *        (or SCL_CORPUS_SOURCE / SCL_XSD_SOURCE)
 *
 * Every file of the source tree with a corpus extension whose root element is `SCL` is read; folders named `old` (any
 * case) and files of another root (logic exports) are left out. The files are grouped by Header uuid: the latest
 * revision that is not excluded (`CORPUS_EXCLUDED`) goes to `smoke/`, the other revisions of a family of several to
 * `pairs/` (fork tests, an excluded revision included), each under its relative path; a byte duplicate is dropped,
 * and an excluded file of a family of one revision is copied nowhere. `MANIFEST.md` lists every family and the
 * excluded files. With `--xsd` the schema files are synced too, from the sibling create package or the `--xsd-from`
 * folder (see sync-xsd.ts). With `--check-excluded` nothing is copied: the corpus checks run on the excluded files
 * where they are, and the files that now pass are listed.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
	CORPUS_EXTENSIONS,
	CORPUS_FILES,
	CORPUS_SMOKE_FOLDER,
	CORPUS_LEFT_OUT_FOLDER,
	CORPUS_MANIFEST,
	CORPUS_PAIRS_FOLDER,
	CORPUS_EXCLUDED,
	CORPUS_EXCLUDED_TITLE_SEPARATOR,
	HEADER_ATTRIBUTE,
	HEADER_ELEMENT,
	ROOT_ELEMENT_WINDOW,
} from '../src/v2019C1/test/corpus/corpus.constants'
import { planCorpus } from '../src/v2019C1/test/corpus/plan-corpus'
import { defaultXsdSource, syncXsd } from './sync-xsd'

import type {
	CaseStatusOfParams,
	CheckExcludedFilesParams,
	CorpusEntry,
	CorpusFamily,
	CorpusSyncArguments,
	ExcludedCheckReport,
	ReportExcludedParams,
} from '../src/v2019C1/test/corpus/corpus.types'

function main(): void {
	const { source, xsdSource, checkExcluded } = readArguments(process.argv.slice(2))
	if (xsdSource) syncXsd({ source: xsdSource })
	if (checkExcluded) {
		checkExcludedFiles({ source })
		return
	}

	const entries = listCorpusFiles({ root: source, folder: '' }).map((file) =>
		readEntry({ root: source, file }),
	)
	const families = planCorpus({
		entries,
		excluded: (file) => CORPUS_EXCLUDED[file] !== undefined,
	})

	const smokeFolder = fromPackageRoot(CORPUS_SMOKE_FOLDER)
	const pairsFolder = fromPackageRoot(CORPUS_PAIRS_FOLDER)
	rmSync(smokeFolder, { recursive: true, force: true })
	rmSync(pairsFolder, { recursive: true, force: true })
	for (const family of families) {
		if (family.smoke) copyInto({ root: source, file: family.smoke.path, folder: smokeFolder })
		for (const pair of family.pairs)
			copyInto({ root: source, file: pair.path, folder: pairsFolder })
	}
	writeFileSync(fromPackageRoot(CORPUS_MANIFEST), manifestOf(families))

	const smokeFiles = families.flatMap((family) => (family.smoke ? [family.smoke.path] : []))
	const pairs = families.flatMap((family) => family.pairs)
	const duplicates = families.flatMap((family) => family.duplicates)
	const sameRevision = families.flatMap((family) => family.sameRevision)
	if (sameRevision.length > 0) {
		console.warn(
			`files of one revision with other bytes, the smoke one chosen by the copy order:\n  ${sameRevision.map((entry) => entry.path).join('\n  ')}`,
		)
	}
	console.info(
		`corpus: ${entries.length} SCL files, ${families.length} families: ${smokeFiles.length} in the smoke, ${pairs.length} pairs, ${duplicates.length} duplicates dropped`,
	)
	reportExcluded({ entries, pairs })
	const listed = new Set(CORPUS_FILES)
	const unlisted = smokeFiles.filter((file) => !listed.has(file))
	const missing = [...listed].filter((file) => !smokeFiles.includes(file))
	if (unlisted.length > 0) console.warn(`not in CORPUS_FILES:\n  ${unlisted.join('\n  ')}`)
	if (missing.length > 0)
		console.warn(`in CORPUS_FILES, not a smoke file:\n  ${missing.join('\n  ')}`)
}

/**
 * The excluded files, counted and grouped by reason: none is in the smoke, those of a family of several revisions are
 * kept as pairs. An excluded path the source does not hold is listed: the entry is stale.
 */
function reportExcluded(params: ReportExcludedParams): void {
	const { entries, pairs } = params
	const present = new Set(entries.map((entry) => entry.path))
	const excluded = Object.entries(CORPUS_EXCLUDED).filter(([file]) => present.has(file))
	const kept = pairs.filter((pair) => CORPUS_EXCLUDED[pair.path] !== undefined).length
	const byReason = new Map<string, string[]>()
	for (const [file, exclusion] of excluded) {
		byReason.set(exclusion.reason, [...(byReason.get(exclusion.reason) ?? []), file])
	}
	const groups = [...byReason.entries()].map(
		([reason, files]) =>
			`  ${files.length} × ${reason}${files.length <= 3 ? `: ${files.join(', ')}` : ''}`,
	)
	console.info(
		[
			`${excluded.length} files excluded (not in the smoke; ${kept} kept as revision pairs):`,
			...groups,
		].join('\n'),
	)
	const stale = Object.keys(CORPUS_EXCLUDED).filter((file) => !present.has(file))
	if (stale.length > 0) console.warn(`excluded, not in the source:\n  ${stale.join('\n  ')}`)
}

/**
 * Run the corpus checks on the excluded files where they are (the corpus-excluded vitest project, which reads the
 * source folder), and list the files that now pass both: those no longer need to be excluded. The cases vitest skipped
 * (no schema files) and the excluded files the source no longer holds are listed apart.
 */
function checkExcludedFiles(params: CheckExcludedFilesParams): void {
	const { source } = params
	const present = new Set(listCorpusFiles({ root: source, folder: '' }))
	const reportFile = path.join(tmpdir(), `scl-corpus-excluded-${process.pid}.json`)
	let vitestError: unknown
	try {
		execFileSync(
			'npx',
			[
				'vitest',
				'run',
				'--project',
				'corpus-excluded',
				'--reporter=json',
				`--outputFile=${reportFile}`,
			],
			{
				cwd: fromPackageRoot(''),
				env: { ...process.env, SCL_CORPUS_SOURCE: source, SCL_CORPUS_CHECK_EXCLUDED: '1' },
				stdio: ['ignore', 'ignore', 'inherit'],
			},
		)
	} catch (error) {
		// the cases of the files still invalid fail: the report says which; without a report vitest did not run
		vitestError = error
	}
	if (!existsSync(reportFile)) throw vitestError ?? new Error('vitest wrote no report')
	const report = JSON.parse(readFileSync(reportFile, 'utf8')) as ExcludedCheckReport
	rmSync(reportFile, { force: true })

	const results = report.testResults.flatMap((file) => file.assertionResults)
	const excluded = Object.keys(CORPUS_EXCLUDED)
	const missing = excluded.filter((file) => !present.has(file))
	const checked = excluded.filter(
		(file) =>
			present.has(file) && ['passed', 'failed'].includes(caseStatusOf({ results, file }) ?? ''),
	)
	const passing = checked.filter((file) => caseStatusOf({ results, file }) === 'passed')
	const skipped = excluded.filter((file) => present.has(file) && !checked.includes(file))
	console.info(
		[
			`${passing.length} of ${checked.length} excluded files checked now pass the corpus checks${passing.length > 0 ? ' (remove them from CORPUS_EXCLUDED, or keep those whose defect no check sees):' : ''}`,
			...passing.map((file) => `  ${file}: ${CORPUS_EXCLUDED[file].reason}`),
		].join('\n'),
	)
	if (missing.length > 0) console.warn(`excluded, not in the source:\n  ${missing.join('\n  ')}`)
	if (skipped.length > 0)
		console.warn(
			`${skipped.length} excluded files not checked (no schema files, npm run xsd:sync, or not found by the glob)`,
		)
}

/** The status vitest gives the case of an excluded file, `undefined` when it has none. */
function caseStatusOf(params: CaseStatusOfParams): string | undefined {
	const { results, file } = params
	const title = `${file}${CORPUS_EXCLUDED_TITLE_SEPARATOR}`
	return results.find((result) => result.title.startsWith(title))?.status
}

/**
 * The corpus folder (the argument, or SCL_CORPUS_SOURCE), the schema folder (`--xsd-from`, SCL_XSD_SOURCE, or the
 * sibling create package with `--xsd`; none without either flag or the variable), and `--check-excluded`.
 */
function readArguments(argv: readonly string[]): CorpusSyncArguments {
	const fromFlag = argv.indexOf('--xsd-from')
	if (
		fromFlag !== -1 &&
		(argv[fromFlag + 1] === undefined || argv[fromFlag + 1].startsWith('--'))
	) {
		throw new Error('--xsd-from needs the path to the xsd folder')
	}
	const fromIndexes = fromFlag === -1 ? [] : [fromFlag, fromFlag + 1]
	const optionIndexes = new Set(
		[...fromIndexes, argv.indexOf('--xsd'), argv.indexOf('--check-excluded')].filter(
			(index) => index >= 0,
		),
	)
	const given =
		argv.filter((_, index) => !optionIndexes.has(index))[0] ?? process.env.SCL_CORPUS_SOURCE
	if (!given) {
		throw new Error(
			'Give the corpus folder: npm run corpus:sync -- "<source folder>" (or SCL_CORPUS_SOURCE)',
		)
	}
	const source = path.resolve(given)
	if (!existsSync(source)) throw new Error(`The corpus folder does not exist: ${source}`)
	const fromFolder = fromFlag === -1 ? process.env.SCL_XSD_SOURCE : argv[fromFlag + 1]
	const xsdSource = fromFolder ?? (argv.includes('--xsd') ? defaultXsdSource() : undefined)
	return { source, xsdSource, checkExcluded: argv.includes('--check-excluded') }
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
				return entry.name.toLowerCase() === CORPUS_LEFT_OUT_FOLDER
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
	if (!CORPUS_EXTENSIONS.includes(extension)) return false
	const head = readFileSync(path.join(root, file)).subarray(0, ROOT_ELEMENT_WINDOW).toString('utf8')
	return rootElementOf(head) === 'SCL'
}

/** The name of the first element of an XML text, past its declaration and comments. */
function rootElementOf(head: string): string | undefined {
	const content = head.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g, '')
	return /<([A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)[\s/>]/.exec(content)?.[2]
}

/** A file and its Header: a file without one is a family of its own, named by its path. */
function readEntry(params: { root: string; file: string }): CorpusEntry {
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

function manifestOf(families: readonly CorpusFamily[]): string {
	const rows = families
		.filter((family) => family.smoke || family.pairs.length > 0)
		.map((family) => {
			const files = [...(family.smoke ? [family.smoke] : []), ...family.pairs, ...family.duplicates]
			const versions = files.map((entry) => `${entry.version}/${entry.revision}`).join(', ')
			const smoke = family.smoke ? `\`${family.smoke.path}\`` : 'none (every revision excluded)'
			return `| \`${family.headerUuid}\` | ${versions} | ${smoke} | ${pathsCell(family.pairs)} | ${pathsCell(family.duplicates)} | ${pathsCell(family.sameRevision)} |`
		})
	const excluded = Object.entries(CORPUS_EXCLUDED).map(
		([file, exclusion]) => `| \`${file}\` | ${exclusion.reason} | ${exclusion.since} |`,
	)
	return [
		'# Corpus manifest',
		'',
		'Written by `npm run corpus:sync`. One row per family (one Header uuid): the file the smoke runs (`smoke/`), the',
		"revisions kept for fork tests (`pairs/`), the byte duplicates dropped, and the pairs of the smoke file's revision",
		'with other bytes (which one is the latest is not known).',
		'',
		'| Header uuid | Versions (version/revision) | Smoke | Pairs | Duplicates dropped | Same revision as the smoke |',
		'| ----------- | --------------------------- | ----- | ----- | ------------------ | -------------------------- |',
		...rows,
		'',
		'## Excluded',
		'',
		'The files of the source left out of the smoke (`CORPUS_EXCLUDED`), never copied but as a revision of a family of',
		'several (a pair above). `npm run corpus:check-excluded` lists those that now pass the corpus checks.',
		'',
		'| File | Reason | Since |',
		'| ---- | ------ | ----- |',
		...excluded,
		'',
	].join('\n')
}

function pathsCell(entries: readonly CorpusEntry[]): string {
	return entries.map((entry) => `\`${entry.path}\``).join('<br>')
}

main()
