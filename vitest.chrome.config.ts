import { fileURLToPath } from 'node:url'

import viteConfig from '/Users/t.menzel/Documents/FIX-2405-Workspaces/scl/vite.config.ts'
import { playwright } from '@vitest/browser-playwright'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'

export default mergeConfig(
	viteConfig,
	defineConfig({
		test: {
			watch: false,
			testTimeout: 5000,
			projects: [
				{
					resolve: viteConfig.resolve,
					plugins: [],
					test: {
						name: 'unit',
						browser: {
							provider: playwright({
								launchOptions: {
									executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
								},
							}),
							enabled: true,
							headless: true,
							instances: [{ browser: 'chromium' }],
							screenshotFailures: false,
						},
						include: ['src/**/*.test.{js,ts,jsx,tsx}'],
						exclude: [...configDefaults.exclude],
						root: fileURLToPath(
							new URL('/Users/t.menzel/Documents/FIX-2405-Workspaces/scl/', import.meta.url),
						),
					},
				},
			],
		},
	}),
)
