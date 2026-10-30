// A vitest config that logs while it loads, as the package's config does when the schema or corpus folder is empty:
// the projects printer must keep its stdout to the JSON.
import { defineConfig } from 'vitest/config'

console.log('logging config: a log line')
console.info('logging config: an info line')

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: 'logged',
					environment: 'node',
					isolate: false,
					include: ['scripts/test-tiers/fixtures/none.test.ts'],
					setupFiles: [],
				},
			},
		],
	},
})
