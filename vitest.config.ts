import { existsSync, globSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
	MUTATION_BROWSER_ONLY_TESTS,
	MUTATION_PROJECT_ENV,
	MUTATION_PROJECT_NAME,
	NODE_STAND_INS_SETUP,
} from './scripts/mutants/mutants.constants'
import { CORPUS_SMOKE_FOLDER } from './src/v2019C1/test/corpus/corpus.constants'
import { SCL_XSD_FILE_NAMES, SCL_XSD_FIXTURE_FOLDER } from './src/v2019C1/test/scl-xsd.constants'
import viteConfig from './vite.config'
import { BROWSER_ONLY_TEST_FILES, NODE_ONLY_TEST_FILES } from './vitest.config.constants'

import { playwright } from '@vitest/browser-playwright'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'

import type { DeclaredTestFile } from './vitest.config.types'

const ROOT = fileURLToPath(new URL('./', import.meta.url))
const CORPUS_SMOKE_PATH = fileURLToPath(new URL(`./${CORPUS_SMOKE_FOLDER}`, import.meta.url))
/** Every unit test file of the package: the corpus checks are left out by each project. */
const UNIT_TESTS = ['src/**/*.test.{js,ts,jsx,tsx}', 'scripts/**/*.test.{js,ts,jsx,tsx}']
/** The tier projects: node (the default), the browser-only list, and the whole suite in the browser. */
const NODE_PROJECT = 'node'
const BROWSER_PROJECT = 'browser'
const BROWSER_ALL_PROJECT = 'browser-all'
/** The setup of the `node` project: the test helpers open their projects on the in-memory store. */
const IN_MEMORY_STORAGE_SETUP = 'src/v2019C1/test/in-memory-storage.setup.ts'
const CORPUS_TESTS = 'src/**/*.corpus.test.ts'
/** The check of the files the sync leaves out, run on demand (`npm run corpus:check-excluded`). */
const CORPUS_EXCLUDED_TESTS = 'src/**/*.excluded.test.ts'
/** Says where the schema files of the output check are, and hands the mutant of a mutation run to the browser. */
const SETUP_FILES = [
	'src/v2019C1/test/fixtures/xsd/use-fixture-schemas.setup.ts',
	'src/v2019C1/test/active-mutant.setup.ts',
]
/** The mutant a mutation run tests (`npm run mutants`), named in the command's environment: none otherwise. */
const ACTIVE_MUTANT_DEFINE = {
	__STRYKER_ACTIVE_MUTANT__: JSON.stringify(process.env.__STRYKER_ACTIVE_MUTANT__ ?? ''),
}
/** A corpus file is the slowest case: the largest SSD imports, exports and validates twice. */
const CORPUS_TEST_TIMEOUT = 120_000

/** Every path of a tier-only list names a file: a moved test file must not drop out of its tier unseen. */
function pathsOf(params: { project: string; files: readonly DeclaredTestFile[] }): string[] {
	const { project, files } = params
	const paths = files.map(function pathOf(file) {
		return file.path
	})
	const missing = paths.filter(function namesNoFile(path) {
		return globSync(path, { cwd: ROOT }).length === 0
	})
	if (missing.length > 0) {
		throw new Error(
			`vitest project "${project}" lists files that do not exist: ${missing.join(', ')}`,
		)
	}
	return paths
}

const browserOnlyPaths = pathsOf({ project: BROWSER_PROJECT, files: BROWSER_ONLY_TEST_FILES })
const nodeOnlyPaths = pathsOf({ project: BROWSER_ALL_PROJECT, files: NODE_ONLY_TEST_FILES })

/** Headless Chromium, one per project: vitest names the instance after the project it belongs to. */
function headlessChromium() {
	return {
		provider: playwright(),
		enabled: true,
		headless: true,
		instances: [{ browser: 'chromium' as const }],
		screenshotFailures: false,
	}
}

const XSD_FOLDER = fileURLToPath(new URL(`./${SCL_XSD_FIXTURE_FOLDER}`, import.meta.url))
const XSD_SYNCED = SCL_XSD_FILE_NAMES.filter((name) => existsSync(`${XSD_FOLDER}/${name}`)).length
if (XSD_SYNCED < SCL_XSD_FILE_NAMES.length) {
	const state =
		XSD_SYNCED === 0
			? 'absent from'
			: `incomplete in (${XSD_SYNCED} of ${SCL_XSD_FILE_NAMES.length})`
	console.info(
		`xsd: the schema files are ${state} ${SCL_XSD_FIXTURE_FOLDER}, the output check runs without the XSD validator and the corpus project skips (npm run xsd:sync)`,
	)
}

if (!existsSync(CORPUS_SMOKE_PATH) || readdirSync(CORPUS_SMOKE_PATH).length === 0) {
	console.info(
		`corpus: ${CORPUS_SMOKE_FOLDER} is empty, the corpus project skips (npm run corpus:sync)`,
	)
}

/**
 * The project checking the files the corpus sync leaves out, in the source folder (`SCL_CORPUS_SOURCE`) where they
 * are read: only when `SCL_CORPUS_CHECK_EXCLUDED` asks for it (`npm run corpus:check-excluded`), never in a plain run.
 */
function corpusExcludedProject() {
	const source = process.env.SCL_CORPUS_SOURCE
	if (!process.env.SCL_CORPUS_CHECK_EXCLUDED || !source) return []
	return [
		{
			resolve: {
				...viteConfig.resolve,
				alias: { ...viteConfig.resolve?.alias, '@scl-corpus-source': source },
			},
			server: { fs: { allow: [ROOT, source] } },
			plugins: [],
			define: ACTIVE_MUTANT_DEFINE,
			test: {
				name: 'corpus-excluded',
				browser: headlessChromium(),
				include: [CORPUS_EXCLUDED_TESTS],
				testTimeout: CORPUS_TEST_TIMEOUT,
				root: ROOT,
				setupFiles: SETUP_FILES,
			},
		},
	]
}

/**
 * The project of the mutation runs (`npm run mutants:fast`): every unit test in node, the browser globals stood in
 * for, so the mutation runner runs only the tests reaching each mutant and keeps its workers warm. The test files of a
 * worker share their modules (no isolation): the modules the setup imports and the package load once per worker, not
 * once per file, five times faster, with the browser's verdicts on the mutants compared. Only when the driver asks for
 * it (`SCL_MUTATION_PROJECT`), never in a plain run: the `node` project and the browser projects stay the check.
 */
function mutationProject() {
	if (!process.env[MUTATION_PROJECT_ENV]) return []
	return [
		{
			resolve: viteConfig.resolve,
			plugins: [],
			test: {
				name: MUTATION_PROJECT_NAME,
				environment: 'node' as const,
				isolate: false,
				include: ['src/**/*.test.{js,ts,jsx,tsx}', 'scripts/**/*.test.ts'],
				exclude: [
					...configDefaults.exclude,
					CORPUS_TESTS,
					CORPUS_EXCLUDED_TESTS,
					...MUTATION_BROWSER_ONLY_TESTS.map(({ file }) => file),
				],
				root: ROOT,
				setupFiles: [NODE_STAND_INS_SETUP, ...SETUP_FILES],
			},
		},
	]
}

export default mergeConfig(
	viteConfig,
	defineConfig({
		test: {
			watch: false,
			testTimeout: 5_000,
			projects: [
				{
					// every unit test file but the browser-only ones, in node on the in-memory store: the test helpers'
					// default, set by the first setup file. The files share their modules: the same verdicts as isolated
					// files, in a quarter of the time
					resolve: viteConfig.resolve,
					plugins: [],
					define: ACTIVE_MUTANT_DEFINE,
					test: {
						name: NODE_PROJECT,
						environment: 'node' as const,
						isolate: false,
						include: UNIT_TESTS,
						exclude: [
							...configDefaults.exclude,
							CORPUS_TESTS,
							CORPUS_EXCLUDED_TESTS,
							...browserOnlyPaths,
						],
						root: ROOT,
						setupFiles: [IN_MEMORY_STORAGE_SETUP, ...SETUP_FILES],
					},
				},
				{
					// the browser-only test files, on the local store
					resolve: viteConfig.resolve,
					plugins: [],
					define: ACTIVE_MUTANT_DEFINE,
					test: {
						name: BROWSER_PROJECT,
						browser: headlessChromium(),
						include: browserOnlyPaths,
						root: ROOT,
						setupFiles: SETUP_FILES,
					},
				},
				{
					// the whole suite in the browser, on the local store: the run before a branch merges
					resolve: viteConfig.resolve,
					plugins: [],
					define: ACTIVE_MUTANT_DEFINE,
					test: {
						name: BROWSER_ALL_PROJECT,
						browser: headlessChromium(),
						include: UNIT_TESTS,
						exclude: [
							...configDefaults.exclude,
							CORPUS_TESTS,
							CORPUS_EXCLUDED_TESTS,
							...nodeOnlyPaths,
						],
						root: ROOT,
						setupFiles: SETUP_FILES,
					},
				},
				{
					resolve: viteConfig.resolve,
					plugins: [],
					define: ACTIVE_MUTANT_DEFINE,
					test: {
						name: 'corpus',
						browser: headlessChromium(),
						include: [CORPUS_TESTS],
						testTimeout: CORPUS_TEST_TIMEOUT,
						root: ROOT,
						setupFiles: SETUP_FILES,
					},
				},
				...corpusExcludedProject(),
				...mutationProject(),
			],
		},
	}),
)
