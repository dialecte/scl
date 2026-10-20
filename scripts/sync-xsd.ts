import { execFileSync } from 'node:child_process'
/**
 * Copy the IEC schema files the output check validates against into the test fixtures, and check each against the
 * sha256 its README lists. The files are not published: the folder ignores them.
 *
 * Usage: npm run xsd:sync [-- --from "<path to the xsd folder>"]   (or SCL_XSD_SOURCE=<path> npm run xsd:sync)
 *
 * Without a path, the files come from the sibling create package (`create/xsd/SCL` beside the scl checkout; from a
 * worktree, beside its main checkout).
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
	SCL_XSD_FILE_NAMES,
	SCL_XSD_FIXTURE_FOLDER,
	SCL_XSD_README_ROW,
	SCL_XSD_SIBLING_SOURCE,
} from '../src/v2019C1/test/scl-xsd.constants'

/** Copy the schema files from `source`; throws, copying nothing, when one is missing or differs from the README. */
export function syncXsd(params: { source: string }): void {
	const { source } = params
	const missing = SCL_XSD_FILE_NAMES.filter((name) => !existsSync(path.join(source, name)))
	if (missing.length > 0) {
		throw new Error(
			`schema files not found in ${source}: ${missing.join(', ')} (give another folder with --from)`,
		)
	}
	const target = fileURLToPath(new URL(`../${SCL_XSD_FIXTURE_FOLDER}`, import.meta.url))
	const expected = readExpectedSums({ readme: path.join(target, 'README.md') })

	const mismatches = SCL_XSD_FILE_NAMES.flatMap((name) => {
		const sum = createHash('sha256')
			.update(readFileSync(path.join(source, name)))
			.digest('hex')
		return sum === expected[name]
			? []
			: [`${name}: ${sum}, the README lists ${expected[name] ?? 'nothing'}`]
	})
	if (mismatches.length > 0) throw new Error(`schema files differ:\n  ${mismatches.join('\n  ')}`)

	for (const name of SCL_XSD_FILE_NAMES)
		copyFileSync(path.join(source, name), path.join(target, name))
	console.info(`xsd: ${SCL_XSD_FILE_NAMES.length} schema files copied to ${target}`)
}

function readExpectedSums(params: { readme: string }): Record<string, string> {
	const { readme } = params
	const rows = readFileSync(readme, 'utf8')
		.split('\n')
		.flatMap((line) => {
			const row = SCL_XSD_README_ROW.exec(line.trim())
			return row ? [[row[1], row[2]] as const] : []
		})
	return Object.fromEntries(rows)
}

/**
 * The schema folder of the sibling create package: beside the root of the repository checkout this package sits in,
 * read through git's common directory, so that a worktree finds the one beside its main checkout.
 */
export function defaultXsdSource(): string {
	const packageRoot = fileURLToPath(new URL('..', import.meta.url))
	const commonDirectory = execFileSync(
		'git',
		['rev-parse', '--path-format=absolute', '--git-common-dir'],
		{ cwd: packageRoot, encoding: 'utf8' },
	).trim()
	return path.resolve(path.dirname(commonDirectory), SCL_XSD_SIBLING_SOURCE)
}

function main(): void {
	const fromFlag = process.argv.indexOf('--from')
	const from = fromFlag === -1 ? undefined : process.argv[fromFlag + 1]
	if (fromFlag !== -1 && (from === undefined || from.startsWith('--'))) {
		throw new Error('--from needs the path to the xsd folder')
	}
	syncXsd({ source: from ?? process.env.SCL_XSD_SOURCE ?? defaultXsdSource() })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
