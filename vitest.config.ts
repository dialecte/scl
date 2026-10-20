import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { CORPUS_V2_FOLDER } from './src/v2019C1/test/corpus/corpus-v2.constants'
import { SCL_XSD_FILE_NAMES, SCL_XSD_FIXTURE_FOLDER } from './src/v2019C1/test/scl-xsd.constants'
import viteConfig from './vite.config'

import { playwright } from '@vitest/browser-playwright'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'

const ROOT = fileURLToPath(new URL('./', import.meta.url))
const CORPUS_FOLDER = fileURLToPath(new URL(`./${CORPUS_V2_FOLDER}`, import.meta.url))
const CORPUS_TESTS = 'src/**/*.corpus.test.ts'
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

if (!existsSync(CORPUS_FOLDER) || readdirSync(CORPUS_FOLDER).length === 0) {
	console.info(
		`corpus: ${CORPUS_V2_FOLDER} is empty, the corpus project skips (npm run corpus:sync)`,
	)
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
						exclude: [...configDefaults.exclude, CORPUS_TESTS],
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
			],
		},
	}),
)
