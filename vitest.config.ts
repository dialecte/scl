import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import viteConfig from './vite.config'

import { playwright } from '@vitest/browser-playwright'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'

const root = fileURLToPath(new URL('./', import.meta.url))

// BENCH_LOCAL_CORE=1 measures the locally BUILT sibling `reference-core` (run `npm run build` there
// first) instead of the installed `@dialecte/core`; measuring a stale build is worse than not measuring.
const localCoreDist = resolve(root, '../reference-core/dist')
const perfResolve = process.env.BENCH_LOCAL_CORE
	? {
			...viteConfig.resolve,
			alias: [
				...Object.entries(viteConfig.resolve?.alias ?? {}).map(([find, replacement]) => ({
					find,
					replacement: replacement as string,
				})),
				{ find: /^@dialecte\/core$/, replacement: `${localCoreDist}/index.js` },
				{ find: /^@dialecte\/core\/(test|utils|helpers)$/, replacement: `${localCoreDist}/$1.js` },
			],
		}
	: viteConfig.resolve

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
						exclude: [...configDefaults.exclude, 'src/**/*.bench.test.{js,ts}'],
						root: fileURLToPath(new URL('./', import.meta.url)),
					},
				},
				{
					// Browser (real Chromium + IndexedDB): both stores. Per-scenario cap lives in the bench file.
					resolve: perfResolve,
					plugins: [],
					test: {
						name: 'perf',
						testTimeout: 600_000,
						browser: {
							provider: playwright(),
							enabled: true,
							headless: true,
							instances: [{ browser: 'chromium' }],
							screenshotFailures: false,
						},
						include: ['src/**/*.bench.test.{js,ts}'],
						root,
					},
				},
				{
					// Node: in-memory store only, but reaches fixture sizes the browser cannot.
					resolve: perfResolve,
					plugins: [],
					test: {
						name: 'perf-node',
						environment: 'node',
						testTimeout: 600_000,
						include: ['src/**/*.bench.test.{js,ts}'],
						root,
					},
				},
			],
		},
	}),
)
