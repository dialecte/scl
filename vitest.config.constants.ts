import type { DeclaredTestFile } from './vitest.config.types'

/**
 * The test files that need a browser: the browser list runs them, the `node` project leaves them out. Every other
 * test file runs in node, on the in-memory store.
 */
export const BROWSER_ONLY_TEST_FILES: readonly DeclaredTestFile[] = [
	{
		path: 'src/v2019C1/test/create-scl-test-project.test.ts',
		why: 'spies on IndexedDB to test the local store: a project opened outside a running test leaves no database',
	},
	{
		path: 'src/v2019C1/declaration.worker.test.ts',
		why: 'starts an SCL engine worker, which stores its project on the origin private file system',
	},
]

/** The test files that read the package from disk: never in a browser. */
export const NODE_ONLY_TEST_FILES: readonly DeclaredTestFile[] = [
	{
		path: 'scripts/test-tiers/test-tiers.test.ts',
		why: 'reads the vitest config, package.json, the workflows and the sources from disk',
	},
	{
		path: 'scripts/packaging/main-entry-tree-shake.test.ts',
		why: 'bundles the package with vite in node',
	},
]

/**
 * The test files about the production factory itself: they may open a project without the test helpers. Every other
 * test file opens its projects through the test helpers, on the store its runner chose.
 */
export const PRODUCTION_FACTORY_TEST_FILES: readonly DeclaredTestFile[] = [
	{
		path: 'src/v2019C1/dialecte.test.ts',
		why: 'createSclProject itself: the project it makes is the declaration’s',
	},
	{
		path: 'src/v2019C1/declaration.worker.test.ts',
		why: 'opens SQLite projects with core’s factory, the engine in a worker: the test helpers’ SQLite kind runs the engine in process',
	},
]
