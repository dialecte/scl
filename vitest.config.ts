import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { CORPUS_SMOKE_FOLDER } from './src/v2019C1/test/corpus/corpus.constants'
import { SCL_XSD_FILE_NAMES, SCL_XSD_FIXTURE_FOLDER } from './src/v2019C1/test/scl-xsd.constants'
import viteConfig from './vite.config'

import { playwright } from '@vitest/browser-playwright'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'

const ROOT = fileURLToPath(new URL('./', import.meta.url))
const CORPUS_SMOKE_PATH = fileURLToPath(new URL(`./${CORPUS_SMOKE_FOLDER}`, import.meta.url))
const CORPUS_TESTS = 'src/**/*.corpus.test.ts'
/** The check of the files the sync leaves out, run on demand (`npm run corpus:check-excluded`). */
const CORPUS_EXCLUDED_TESTS = 'src/**/*.excluded.test.ts'
/** Says where the schema files of the output check are. */
const SETUP_FILES = ['src/v2019C1/test/fixtures/xsd/use-fixture-schemas.setup.ts']
/** A corpus file is the slowest case: the largest SSD imports, exports and validates twice. */
const CORPUS_TEST_TIMEOUT = 120_000

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

export default mergeConfig(
	viteConfig,
	defineConfig({
		test: {
			watch: false,
			testTimeout: 5_000,
			projects: [
				{
					resolve: viteConfig.resolve,
					plugins: [],
					test: {
						name: 'unit',
						browser: headlessChromium(),
						include: ['src/**/*.test.{js,ts,jsx,tsx}'],
						exclude: [...configDefaults.exclude, CORPUS_TESTS, CORPUS_EXCLUDED_TESTS],
						root: ROOT,
						setupFiles: SETUP_FILES,
					},
				},
				{
					resolve: viteConfig.resolve,
					plugins: [],
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
			],
		},
	}),
)
