import type { BrowserOnlyTest, MutantsTier } from './mutants.types'

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

/** Statuses that are no kill: the mutant ran and no test failed, or no test ran it. */
export const SURVIVING_STATUSES: ReadonlySet<string> = new Set(['Survived', 'NoCoverage'])

/** A mutant the node tier gave up on: run again alone, it stays a timeout only when it times out again. */
export const TIMEOUT_STATUS = 'Timeout'

/** The status the browser tier's kill gives a survivor of the node tier. */
export const KILLED_STATUS = 'Killed'

/**
 * The source files a diff names for mutation: code under `src`, not its tests, types, setups, fixtures or generated
 * definition.
 */
export const MUTABLE_SOURCE =
	/^src\/(?!.*\/(?:fixtures|__tests__)\/).*(?<!\.test|\.types|\.d|\.generated|\.setup)\.ts$/

/** A `--mutate` target: `file`, `file:line-line` or `file:line:column-line:column`. */
export const MUTATE_TARGET = /^(.*?)(?::(\d+)(?::(\d+))?-(\d+)(?::(\d+))?)?$/

/** A hunk header of `git diff -U0`: the first line and the count of the new side. */
export const DIFF_HUNK = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/

/** The new side's path in a `git diff` file header. */
export const DIFF_NEW_PATH = '+++ b/'

export const MUTANTS_TIERS: readonly MutantsTier[] = ['fast', 'full', 'all']

/** The configs of the three runs, the records, and the verdicts the driver writes, relative to the package root. */
export const MUTANTS_PATHS = {
	records: 'scripts/mutants/equivalent-mutants.json',
	fastConfig: 'stryker.config.json',
	timeoutsConfig: 'stryker.timeouts.config.json',
	fullConfig: 'stryker.full.config.json',
	fastVerdict: '.tmp/stryker/report-fast.json',
	mergedVerdict: '.tmp/stryker/report-merged.json',
} as const
