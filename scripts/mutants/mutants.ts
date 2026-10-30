/**
 * The mutation gate of the package. StrykerJS changes the code one point at a time and runs the tests that reach
 * each change; every change no test notices must be listed in `scripts/mutants/equivalent-mutants.json` with the
 * reason it cannot alter any output.
 *
 * - `npm run mutants:fast -- <file | file:line-line>… [--diff <ref>] [--record] [--force]`: the node tier (the
 *   `mutation` vitest project) on the files and ranges named, or on the lines changed since `<ref>`; the mutants that
 *   timed out run again alone, and stay timeouts only when they time out again; then the verdict.
 * - `npm run mutants:full [-- --record]`: the browser tier (the `browser-all` project) on the fast run's unlisted survivors,
 *   each at its range; a kill in either tier is a kill; then the verdict.
 * - `npm run mutants -- …`: the fast tier, then the full tier when unlisted survivors remain.
 *
 * `--record` writes the new survivors with an empty reason to fill and drops the stale records.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
	diffRanges,
	judgeReport,
	parseTarget,
	rangesOf,
	recordSurvivors,
	withFullRun,
	withinTargets,
	withLoneTimeouts,
} from './judge'
import {
	KILLED_STATUS,
	MUTANTS_PATHS,
	MUTANTS_TIERS,
	MUTATION_PROJECT_ENV,
	SURVIVING_STATUSES,
	TIMEOUT_STATUS,
} from './mutants.constants'

import type {
	EquivalentMutants,
	FastVerdict,
	MutantsArguments,
	MutantsTier,
	MutationReport,
	StrykerConfig,
} from './mutants.types'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function main(): number {
	const args = parseArguments({ argv: process.argv.slice(2) })
	if (args.tier === 'full') return runFullTier({ args, fast: readFastVerdict() })
	const fast = runFastTier({ args })
	if (fast === undefined) return 1
	const unlisted = judgeReport({ report: fast, records: readRecords() }).unlisted
	if (args.tier === 'fast' || unlisted.length === 0)
		return gate({ report: fast, wholeFiles: fast.wholeFiles, args })
	return runFullTier({ args, fast })
}

function parseArguments(params: { argv: readonly string[] }): MutantsArguments {
	const [tier, ...rest] = params.argv
	if (!MUTANTS_TIERS.includes(tier as MutantsTier))
		throw new Error(
			`mutants: the first argument is the tier (${MUTANTS_TIERS.join(', ')}), not ${tier}`,
		)
	const targets: string[] = []
	let diffBase: string | undefined
	for (let index = 0; index < rest.length; index++) {
		const arg = rest[index] ?? ''
		if (arg === '--diff') {
			diffBase = rest[++index]
			if (diffBase === undefined || diffBase.startsWith('--'))
				throw new Error('mutants: --diff takes a git revision')
		} else if (arg.startsWith('--') && arg !== '--record' && arg !== '--force')
			throw new Error(`mutants: unknown option ${arg}`)
		else if (!arg.startsWith('--')) targets.push(arg)
	}
	const force = rest.includes('--force')
	if (tier === 'full' && (targets.length > 0 || diffBase !== undefined || force))
		throw new Error("mutants: the full tier runs the fast tier's survivors, it takes --record only")
	return { tier: tier as MutantsTier, record: rest.includes('--record'), force, diffBase, targets }
}

/** The node tier, then its timed-out mutants alone; the merged report is kept for the full tier. */
function runFastTier(params: { args: MutantsArguments }): FastVerdict | undefined {
	const { args } = params
	const named = args.targets.map((target) => packagePath({ target }))
	const mutate = [...named, ...(args.diffBase ? changedRanges({ base: args.diffBase }) : [])]
	if (mutate.length === 0) {
		process.stderr.write(
			'mutants: name the files or ranges to mutate, or --diff <ref> with a change\n',
		)
		return undefined
	}
	const targets = mutate.map((target) => parseTarget({ target }))
	const missing = targets.filter(({ file }) => !existsSync(join(PACKAGE_ROOT, file)))
	if (missing.length > 0) {
		process.stderr.write(`mutants: no such file: ${missing.map(({ file }) => file).join(', ')}\n`)
		return undefined
	}
	const mutationProject = { [MUTATION_PROJECT_ENV]: '1' }
	if (
		stryker({
			config: MUTANTS_PATHS.fastConfig,
			mutate,
			force: args.force,
			env: mutationProject,
		}) !== 0
	)
		return undefined
	// an incremental report also holds earlier runs on other files: only this run's targets are judged
	const fast = withinTargets({
		report: readRunReport({ config: MUTANTS_PATHS.fastConfig }),
		targets,
	})
	const empty = [...new Set(named.map((target) => parseTarget({ target }).file))].filter(
		(file) => fast.files[file] === undefined,
	)
	if (empty.length > 0) process.stdout.write(`mutants: no mutant in ${empty.join(', ')}\n`)
	const timeouts = rangesOf({ report: fast, select: (status) => status === TIMEOUT_STATUS })
	let report = fast
	if (timeouts.length > 0) {
		process.stdout.write(`mutants: ${timeouts.length} timed out, each run again alone\n`)
		if (
			stryker({ config: MUTANTS_PATHS.timeoutsConfig, mutate: timeouts, env: mutationProject }) !==
			0
		)
			return undefined
		report = withLoneTimeouts({
			report: fast,
			alone: readRunReport({ config: MUTANTS_PATHS.timeoutsConfig }),
		})
	}
	const wholeFiles = targets.filter(({ range }) => range === undefined).map(({ file }) => file)
	const verdict: FastVerdict = { ...report, wholeFiles: [...new Set(wholeFiles)] }
	writeJson({ path: MUTANTS_PATHS.fastVerdict, value: verdict })
	return verdict
}

/** The browser tier on the fast run's unlisted survivors, merged into the fast run's verdicts. */
function runFullTier(params: { args: MutantsArguments; fast: FastVerdict }): number {
	const { args, fast } = params
	const changed = Object.entries(fast.files)
		.filter(([file, { source }]) => readSource({ file }) !== source)
		.map(([file]) => file)
	if (changed.length > 0) {
		process.stderr.write(
			`mutants: changed since the fast run, run npm run mutants:fast again: ${changed.join(', ')}\n`,
		)
		return 1
	}
	const unlisted = judgeReport({ report: fast, records: readRecords() }).unlisted
	const ranges = [...new Set(unlisted.map(({ range }) => range))]
	if (ranges.length === 0) return gate({ report: fast, wholeFiles: fast.wholeFiles, args })
	process.stdout.write(`mutants: ${ranges.length} unlisted survivors, run in the browser\n`)
	if (stryker({ config: MUTANTS_PATHS.fullConfig, mutate: ranges }) !== 0) return 1
	const report = withFullRun({ fast, full: readRunReport({ config: MUTANTS_PATHS.fullConfig }) })
	writeJson({ path: MUTANTS_PATHS.mergedVerdict, value: report })
	return gate({ report, wholeFiles: fast.wholeFiles, args })
}

function gate(params: {
	report: MutationReport
	wholeFiles: readonly string[]
	args: MutantsArguments
}): number {
	const { report, wholeFiles, args } = params
	const records = readRecords()
	const verdict = judgeReport({ report, records, wholeFiles })
	process.stdout.write(`${summary({ report })}\n`)
	if (args.record)
		writeJson({ path: MUTANTS_PATHS.records, value: recordSurvivors({ records, verdict }) })
	for (const survivor of verdict.unlisted)
		process.stdout.write(`UNLISTED ${survivor.range} ${survivor.key} ${survivor.mutation}\n`)
	for (const { file, key } of args.record ? [] : verdict.stale)
		process.stdout.write(`STALE ${file} ${key}: recorded, no longer survives\n`)
	const green = verdict.unlisted.length === 0 && (args.record || verdict.stale.length === 0)
	process.stdout.write(`mutation gate: ${green ? 'green' : 'red'}\n`)
	return green ? 0 : 1
}

function summary(params: { report: MutationReport }): string {
	const mutants = Object.values(params.report.files).flatMap(({ mutants }) => mutants)
	function count(select: (status: string) => boolean): number {
		return mutants.filter(({ status }) => select(status)).length
	}
	const others = count(
		(status) =>
			status !== KILLED_STATUS && status !== TIMEOUT_STATUS && !SURVIVING_STATUSES.has(status),
	)
	const counts = [
		`${count((status) => status === KILLED_STATUS)} killed`,
		`${count((status) => status === TIMEOUT_STATUS)} timeouts`,
		`${count((status) => SURVIVING_STATUSES.has(status))} surviving`,
		...(others > 0 ? [`${others} other (errors, ignored)`] : []),
	]
	return `${mutants.length} mutants over ${Object.keys(params.report.files).length} files: ${counts.join(', ')}`
}

/** A target as the report names its file: relative to the package root, with `/` separators. */
function packagePath(params: { target: string }): string {
	const { file } = parseTarget(params)
	const relativeFile = relative(PACKAGE_ROOT, resolve(PACKAGE_ROOT, file)).split(sep).join('/')
	return `${relativeFile}${params.target.slice(file.length)}`
}

function changedRanges(params: { base: string }): string[] {
	const quotePathOff = ['-c', 'core.quotePath=false']
	const diff = git({
		args: [...quotePathOff, 'diff', '--no-color', '--no-ext-diff', '-U0', params.base, '--', 'src'],
	})
	const untracked = git({
		args: [...quotePathOff, 'ls-files', '--others', '--exclude-standard', '--', 'src'],
	})
	return diffRanges({ diff, untracked: untracked.split('\n').filter(Boolean) })
}

function git(params: { args: readonly string[] }): string {
	const run = spawnSync('git', params.args, { cwd: PACKAGE_ROOT, encoding: 'utf-8' })
	if (run.status !== 0)
		throw new Error(`mutants: git ${params.args.join(' ')} failed: ${run.stderr}`)
	return run.stdout
}

function stryker(params: {
	config: string
	mutate: readonly string[]
	force?: boolean
	env?: Readonly<Record<string, string>>
}): number {
	const { config, mutate, force = false, env = {} } = params
	const run = spawnSync(
		process.execPath,
		[strykerBin(), 'run', config, '--mutate', mutate.join(','), ...(force ? ['--force'] : [])],
		{ cwd: PACKAGE_ROOT, stdio: 'inherit', env: { ...process.env, ...env } },
	)
	return run.status ?? 1
}

/** StrykerJS's command, wherever the package manager put it. */
function strykerBin(): string {
	const require = createRequire(import.meta.url)
	const manifest = require.resolve('@stryker-mutator/core/package.json')
	const { bin } = JSON.parse(readFileSync(manifest, 'utf-8')) as { bin: { stryker: string } }
	return join(dirname(manifest), bin.stryker)
}

/** The report a run of this config wrote. */
function readRunReport(params: { config: string }): MutationReport {
	const config = readJson<StrykerConfig>({ path: params.config })
	return readJson<MutationReport>({ path: config.jsonReporter.fileName })
}

function readFastVerdict(): FastVerdict {
	if (!existsSync(join(PACKAGE_ROOT, MUTANTS_PATHS.fastVerdict)))
		throw new Error(
			`mutants: no fast run to follow (${MUTANTS_PATHS.fastVerdict}): run npm run mutants:fast first`,
		)
	return readJson<FastVerdict>({ path: MUTANTS_PATHS.fastVerdict })
}

function readRecords(): EquivalentMutants {
	return readJson<EquivalentMutants>({ path: MUTANTS_PATHS.records })
}

function readSource(params: { file: string }): string | undefined {
	const path = join(PACKAGE_ROOT, params.file)
	return existsSync(path) ? readFileSync(path, 'utf-8') : undefined
}

function readJson<Value>(params: { path: string }): Value {
	return JSON.parse(readFileSync(join(PACKAGE_ROOT, params.path), 'utf-8')) as Value
}

function writeJson(params: { path: string; value: unknown }): void {
	const path = join(PACKAGE_ROOT, params.path)
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, `${JSON.stringify(params.value, null, '\t')}\n`)
}

process.exitCode = main()
