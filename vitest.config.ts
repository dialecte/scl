import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { SCL_XSD_FILE_NAMES, SCL_XSD_FIXTURE_FOLDER } from './src/v2019C1/test/scl-xsd.constants'
import viteConfig from './vite.config'

import { playwright } from '@vitest/browser-playwright'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'

const XSD_FOLDER = fileURLToPath(new URL(`./${SCL_XSD_FIXTURE_FOLDER}`, import.meta.url))
const XSD_SYNCED = SCL_XSD_FILE_NAMES.filter((name) => existsSync(`${XSD_FOLDER}/${name}`)).length
if (XSD_SYNCED < SCL_XSD_FILE_NAMES.length) {
	const state =
		XSD_SYNCED === 0
			? 'absent from'
			: `incomplete in (${XSD_SYNCED} of ${SCL_XSD_FILE_NAMES.length})`
	console.info(
		`xsd: the schema files are ${state} ${SCL_XSD_FIXTURE_FOLDER}, the output check runs without the XSD validator (npm run xsd:sync)`,
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
						browser: {
							provider: playwright(),
							enabled: true,
							headless: true,
							instances: [{ browser: 'chromium' }],
							screenshotFailures: false,
						},
						include: ['src/**/*.test.{js,ts,jsx,tsx}'],
						exclude: [...configDefaults.exclude],
						root: fileURLToPath(new URL('./', import.meta.url)),
						setupFiles: ['src/v2019C1/test/fixtures/xsd/use-fixture-schemas.setup.ts'],
					},
				},
			],
		},
	}),
)
