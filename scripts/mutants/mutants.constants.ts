import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { MutantsTier } from './mutants.types'

/** The package root: the driver runs its commands and reads its reports from there. */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** The vitest project of the mutation runs: the node tier, under the name the mutation config selects. */
export const MUTATION_PROJECT_NAME = 'mutation'

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
