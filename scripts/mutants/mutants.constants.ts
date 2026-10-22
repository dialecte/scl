import type { BrowserOnlyTest } from './mutants.types'

/** The vitest project of the mutation runs: every unit test, in node. */
export const MUTATION_PROJECT_NAME = 'mutation'

/** Set by the mutation driver: the `mutation` project exists only then, a plain test run never runs it. */
export const MUTATION_PROJECT_ENV = 'SCL_MUTATION_PROJECT'

/** The setup giving node the browser globals the tests reach for. */
export const NODE_STAND_INS_SETUP = 'scripts/mutants/node-stand-ins.setup.ts'

/**
 * Test files the node stand-ins cannot carry, each with the reason: the `mutation` project leaves them out, and only
 * the browser tier (`npm run mutants:full`) runs them.
 */
export const MUTATION_BROWSER_ONLY_TESTS: readonly BrowserOnlyTest[] = []

/** The namespace of the namespace declarations (`xmlns`, `xmlns:prefix`). */
export const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/'
