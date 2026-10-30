import { spawnSync } from 'node:child_process'
import { existsSync, globSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

import vitestConfig from '../../vitest.config'
import {
	BROWSER_ONLY_TEST_FILES,
	NODE_ONLY_TEST_FILES,
	PRODUCTION_FACTORY_TEST_FILES,
} from '../../vitest.config.constants'
import { MUTANTS_PATHS, MUTATION_RUN_ENVIRONMENT } from '../mutants/mutants.constants'
import { printedProjectsOf } from './printed-projects'
import {
	BROWSER_ALL_SCRIPT,
	BROWSER_GLOBAL_SET_BY_HAND,
	BROWSER_ONLY_XML_APIS,
	COMMAND_SEPARATOR,
	CORPUS_TEST_FILE_PATTERNS,
	GUARD_FOLDER,
	GUARD_TEST_FILE,
	IGNORED_FOLDERS,
	IMPORT_SPECIFIER,
	IN_MEMORY_STORAGE_CALL,
	LOGGING_CONFIG_FIXTURE,
	LOGGING_CONFIG_PROJECT,
	NODE_PROJECT_NAME,
	NPM_RUN_COMMAND,
	NPM_TEST_COMMAND,
	PRODUCTION_ENTRY,
	PRODUCTION_FACTORY_CALL,
	PROJECT_FLAG,
	PROJECTS_PRINTER,
	PROJECTS_PRINTER_TIMEOUT,
	PULL_REQUEST_TRIGGER,
	PULL_REQUEST_WORKFLOW,
	RESOLVED_SUFFIXES,
	RUN_ALL_COMMAND,
	SOURCE_FILE_PATTERNS,
	STAND_IN_PACKAGE_IMPORTERS,
	STAND_IN_PACKAGES,
	STORE_NAMED,
	TEST_ENTRY,
	TEST_WORKFLOW,
	TYPES_SCOPE,
	UNIT_TEST_FILE_PATTERNS,
	WORKFLOW_RUN_LINE,
} from './test-tiers.constants'

import { describe, expect, it } from 'vitest'

import type { DeclaredTestFile } from '../../vitest.config.types'
import type {
	ConfiguredProject,
	MutationRunConfig,
	PackageManifest,
	TierRun,
	TierShape,
} from './test-tiers.types'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

function readText(path: string): string {
	return readFileSync(`${ROOT}${path}`, 'utf8')
}

function readManifest(): PackageManifest {
	return JSON.parse(readText('package.json')) as PackageManifest
}

function isString(entry: unknown): entry is string {
	return typeof entry === 'string'
}

function stringsOf(value: unknown): string[] {
	if (typeof value === 'string') return [value]
	if (!Array.isArray(value)) return []
	return value.filter(isString)
}

function recordOf(value: unknown): Record<string, unknown> {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function toProject(project: unknown): ConfiguredProject {
	const test = recordOf(recordOf(project).test)
	return {
		name: typeof test.name === 'string' ? test.name : '',
		include: stringsOf(test.include),
		exclude: stringsOf(test.exclude),
		setupFiles: stringsOf(test.setupFiles),
		environment: typeof test.environment === 'string' ? test.environment : undefined,
		isolate: typeof test.isolate === 'boolean' ? test.isolate : undefined,
		inBrowser: recordOf(test.browser).enabled === true,
	}
}

/** The inline projects of the config, each read as the guard needs it. */
function configuredProjects(): ConfiguredProject[] {
	const projects = recordOf(recordOf(vitestConfig).test).projects
	return (Array.isArray(projects) ? projects : []).map(toProject)
}

function projectNamed(name: string | undefined): ConfiguredProject | undefined {
	return configuredProjects().find(function hasName(project) {
		return project.name === name
	})
}

function isInBrowser(project: ConfiguredProject | undefined): boolean {
	return project?.inBrowser === true
}

function sorted(paths: Iterable<string>): string[] {
	return [...new Set(paths)].sort()
}

/** The files the include and exclude patterns select, as vitest would. */
function filesOf(params: { include: readonly string[]; exclude: readonly string[] }): string[] {
	if (params.include.length === 0) return []
	return sorted(
		globSync([...params.include], {
			cwd: ROOT,
			exclude: [...IGNORED_FOLDERS, ...params.exclude],
		}),
	)
}

function filesOfProject(project: ConfiguredProject | undefined): string[] {
	return project ? filesOf({ include: project.include, exclude: project.exclude }) : []
}

/** Every unit test file of the package: the whole suite, the corpus checks left out. */
function unitTestFiles(): string[] {
	return filesOf({ include: UNIT_TEST_FILE_PATTERNS, exclude: CORPUS_TEST_FILE_PATTERNS })
}

function corpusTestFiles(): string[] {
	return filesOf({ include: CORPUS_TEST_FILE_PATTERNS, exclude: [] })
}

function pathOf(file: DeclaredTestFile): string {
	return file.path
}

function without(params: {
	files: readonly string[]
	left: readonly DeclaredTestFile[]
}): string[] {
	const left = new Set(params.left.map(pathOf))
	return params.files.filter(function isKept(file) {
		return !left.has(file)
	})
}

/** The declared entries naming no unit test file, or saying no why. */
function staleEntries(entries: readonly DeclaredTestFile[]): DeclaredTestFile[] {
	const unitFiles = new Set(unitTestFiles())
	return entries.filter(function isStale(entry) {
		return !unitFiles.has(entry.path) || entry.why.trim() === ''
	})
}

/** The commands a script line runs, each `npm run <script>`, `npm test` and `run-s` / `run-p` followed into the script it names. */
function expandedCommands(params: {
	line: string
	scripts: Readonly<Record<string, string>>
	seen?: ReadonlySet<string>
}): string[] {
	const { line, scripts } = params
	const seen = params.seen ?? new Set<string>()
	function expandScript(name: string): string[] {
		const script = scripts[name]
		if (script === undefined || seen.has(name)) return []
		return expandedCommands({ line: script, scripts, seen: new Set([...seen, name]) })
	}
	return line.split(COMMAND_SEPARATOR).flatMap(function expandCommand(part) {
		const command = part.trim()
		const npmRun = NPM_RUN_COMMAND.exec(command)
		if (npmRun) return expandScript(npmRun[1])
		if (NPM_TEST_COMMAND.test(command)) return expandScript('test')
		const runAll = RUN_ALL_COMMAND.exec(command)
		if (runAll) {
			const names = runAll[1].split(/\s+/).filter(function isScriptName(word) {
				return word !== '' && !word.startsWith('-')
			})
			return names.flatMap(expandScript)
		}
		return command === '' ? [] : [command]
	})
}

function projectsNamedBy(command: string): string[] {
	return [...command.matchAll(PROJECT_FLAG)].map(function projectName(match) {
		return match[1]
	})
}

/** The projects a list of script lines runs, in order, npm scripts followed. */
function projectsRunBy(lines: readonly string[]): string[] {
	const { scripts } = readManifest()
	return lines
		.flatMap(function expandLine(line) {
			return expandedCommands({ line, scripts })
		})
		.flatMap(projectsNamedBy)
}

/** What a run of script lines does: its first project, then the files of the others and whether a browser runs them. */
function tierRunOf(lines: readonly string[]): TierRun {
	const [first, ...then] = projectsRunBy(lines)
	const thenProjects = then.map(projectNamed)
	return {
		first,
		thenFiles: sorted(thenProjects.flatMap(filesOfProject)),
		thenAllInBrowser: thenProjects.every(isInBrowser),
	}
}

/** The node tier first, then the browser list in a browser (nothing after node when the list is empty). */
function nodeThenBrowserList(): TierRun {
	return {
		first: NODE_PROJECT_NAME,
		thenFiles: sorted(BROWSER_ONLY_TEST_FILES.map(pathOf)),
		thenAllInBrowser: true,
	}
}

function stepRun(step: { run: string }): string {
	return step.run
}

/** The commands of a workflow's `run:` steps, a `|` or `>` block read line by line. */
function workflowRunLines(path: string): string[] {
	const lines = readText(path).split('\n')
	const commands: string[] = []
	let blockIndent: number | undefined
	for (const line of lines) {
		if (blockIndent !== undefined) {
			const indent = line.length - line.trimStart().length
			if (line.trim() === '' || indent > blockIndent) {
				if (line.trim() !== '') commands.push(line.trim())
				continue
			}
			blockIndent = undefined
		}
		const run = WORKFLOW_RUN_LINE.exec(line)
		if (!run) continue
		const value = run[2].trim()
		if (value.startsWith('|') || value.startsWith('>')) blockIndent = run[1].length
		else commands.push(value)
	}
	return commands
}

/** A module a source imports, resolved to a file of the package (`@/` is `src/`); a package import resolves to none. */
function resolveImport(params: { from: string; specifier: string }): string | undefined {
	const { from, specifier } = params
	let base: string
	if (specifier.startsWith('@/')) base = `src/${specifier.slice(2)}`
	else if (specifier.startsWith('.')) base = join(dirname(from), specifier)
	else return undefined
	const found = RESOLVED_SUFFIXES.map(function withSuffix(suffix) {
		return normalize(`${base}${suffix}`)
	}).find(function isFile(candidate) {
		return existsSync(`${ROOT}${candidate}`) && statSync(`${ROOT}${candidate}`).isFile()
	})
	return found
}

/** Every file of the package a set of sources reaches through its imports, the sources included. */
function reachedFrom(sources: readonly string[]): Set<string> {
	const reached = new Set<string>()
	const pending = [...sources]
	while (pending.length > 0) {
		const file = pending.pop()
		if (file === undefined || reached.has(file)) continue
		reached.add(file)
		for (const match of readText(file).matchAll(IMPORT_SPECIFIER)) {
			const resolved = resolveImport({ from: file, specifier: match[1] })
			if (resolved && !reached.has(resolved)) pending.push(resolved)
		}
	}
	return reached
}

function setupFilesOf(project: ConfiguredProject): readonly string[] {
	return project.setupFiles
}

/**
 * The test helpers: what the test entry, the unit tests and every project's setup files reach that production does
 * not, tests and this guard left out.
 */
function testHelpers(): string[] {
	const production = reachedFrom([PRODUCTION_ENTRY])
	const unitFiles = new Set(unitTestFiles())
	const setupFiles = configuredProjects().flatMap(setupFilesOf)
	return sorted(
		[...reachedFrom([TEST_ENTRY, ...unitFiles, ...setupFiles])].filter(function isHelper(file) {
			return (
				!production.has(file) &&
				!unitFiles.has(file) &&
				!file.startsWith(GUARD_FOLDER) &&
				/\.(?:ts|js)$/.test(file) &&
				!file.endsWith('.d.ts')
			)
		}),
	)
}

/** What a project runs, as two tiers are compared. */
function tierShapeOf(project: ConfiguredProject | undefined): TierShape {
	return {
		files: filesOfProject(project),
		setupFiles: project?.setupFiles ?? [],
		environment: project?.environment,
		isolate: project?.isolate,
		inBrowser: isInBrowser(project),
	}
}

function readMutationRunConfig(path: string): MutationRunConfig {
	return JSON.parse(readText(path)) as MutationRunConfig
}

/** The vitest-runner mutation runs: the driver names the mutation project in their environment. */
const VITEST_MUTATION_RUNS = [MUTANTS_PATHS.fastConfig, MUTANTS_PATHS.timeoutsConfig]

/** What the projects printer wrote: the projects as the guard reads them, or its stdout when that is no JSON list. */
function readPrinted(stdout: string): ConfiguredProject[] | string {
	try {
		const printed: unknown = JSON.parse(stdout)
		return Array.isArray(printed) ? printed.map(toProject) : stdout
	} catch {
		return stdout
	}
}

/** The projects printer's output on a config, in the environment given, bounded in time. */
function printProjects(params: {
	configFile: string
	environment: Readonly<Record<string, string>>
}): ConfiguredProject[] | string {
	const { configFile, environment } = params
	const printed = spawnSync(process.execPath, ['--import', 'tsx', PROJECTS_PRINTER, configFile], {
		cwd: ROOT,
		encoding: 'utf8',
		env: { ...process.env, ...environment },
		timeout: PROJECTS_PRINTER_TIMEOUT,
	})
	if (printed.error !== undefined || printed.status !== 0)
		throw new Error(
			`the projects of ${configFile} could not be read: status ${printed.status}, signal ${printed.signal}, ${printed.error?.message ?? ''} ${printed.stderr ?? ''}`,
		)
	return readPrinted(printed.stdout)
}

const printedProjects = new Map<string, ConfiguredProject[]>()

/** The projects a vitest-runner mutation run loads: its vitest config, in the environment the driver gives it. */
function projectsOfMutationRun(path: string): ConfiguredProject[] {
	const configFile = readMutationRunConfig(path).vitest?.configFile
	if (configFile === undefined) return []
	const known = printedProjects.get(configFile)
	if (known) return known
	const projects = printProjects({ configFile, environment: MUTATION_RUN_ENVIRONMENT })
	if (typeof projects === 'string')
		throw new Error(`the projects printer wrote no JSON list for ${configFile}: ${projects}`)
	printedProjects.set(configFile, projects)
	return projects
}

/** The projects every node-environment run uses: the configured ones and the mutation runs'. */
function nodeEnvironmentProjects(): ConfiguredProject[] {
	return [...configuredProjects(), ...VITEST_MUTATION_RUNS.flatMap(projectsOfMutationRun)].filter(
		function runsInNode(project) {
			return project.environment === 'node'
		},
	)
}

/** The stand-in packages a specifier names, a subpath (`fake-indexeddb/auto`) or a scope's package included. */
function standInPackagesOf(specifier: string): string[] {
	return STAND_IN_PACKAGES.filter(function isNamed(name) {
		return specifier === name || specifier.startsWith(`${name}/`)
	})
}

/** The stand-in packages a dependency of package.json is, its type package (`@types/jsdom`) counting as the package. */
function standInPackagesListedAs(dependency: string): string[] {
	return standInPackagesOf(
		dependency.startsWith(TYPES_SCOPE) ? dependency.slice(TYPES_SCOPE.length) : dependency,
	)
}

/** The stand-ins a source installs: the stand-in packages it imports, and browser globals it sets by hand. */
function standInsInstalledBy(source: string): string[] {
	const packages = [...source.matchAll(IMPORT_SPECIFIER)].flatMap(function named(match) {
		return standInPackagesOf(match[1])
	})
	return BROWSER_GLOBAL_SET_BY_HAND.pattern.test(source)
		? [...packages, BROWSER_GLOBAL_SET_BY_HAND.name]
		: packages
}

/** The declared importers naming no file, or saying no why. */
function staleImporters(): DeclaredTestFile[] {
	return STAND_IN_PACKAGE_IMPORTERS.filter(function isStale(entry) {
		return !existsSync(`${ROOT}${entry.path}`) || entry.why.trim() === ''
	})
}

/** The package's own source files: every file a test, a script or a config can import from, the guard's test file left out (its samples name the packages it bans). */
function sourceFiles(): string[] {
	return sorted(
		globSync([...SOURCE_FILE_PATTERNS], {
			cwd: ROOT,
			exclude: [...IGNORED_FOLDERS, GUARD_TEST_FILE],
		}),
	)
}

/** The browser-only XML APIs a source uses. */
function browserOnlyXmlApisOf(source: string): string[] {
	return BROWSER_ONLY_XML_APIS.filter(function isUsed(api) {
		return api.pattern.test(source)
	}).map(function apiName(api) {
		return api.name
	})
}

function usesInMemoryStore(file: string): boolean {
	return IN_MEMORY_STORAGE_CALL.test(readText(file))
}

describe('test tiers', () => {
	it('the node project runs every unit test file but the browser-only list', () => {
		expect(filesOfProject(projectNamed(NODE_PROJECT_NAME))).toEqual(
			without({ files: unitTestFiles(), left: BROWSER_ONLY_TEST_FILES }),
		)
	})

	it('the node project runs in node, its setup selecting the in-memory store', () => {
		const project = projectNamed(NODE_PROJECT_NAME)
		expect({
			environment: project?.environment,
			selectsInMemoryStore: (project?.setupFiles ?? []).some(usesInMemoryStore),
		}).toEqual({ environment: 'node', selectsInMemoryStore: true })
	})

	it('each tier-only entry names one test file and says why', () => {
		expect(staleEntries([...BROWSER_ONLY_TEST_FILES, ...NODE_ONLY_TEST_FILES])).toEqual([])
	})

	it('no test file names its store: the runner chooses it', () => {
		expect(
			unitTestFiles().filter(function namesItsStore(file) {
				const source = readText(file)
				return STORE_NAMED.some(function matches(pattern) {
					return pattern.test(source)
				})
			}),
		).toEqual([])
	})

	it('test files open their projects through the test helpers, the production factory only where declared', () => {
		const declared = new Set(PRODUCTION_FACTORY_TEST_FILES.map(pathOf))
		expect({
			openWithTheFactory: unitTestFiles().filter(function opensWithTheFactory(file) {
				const source = readText(file)
				return (
					!declared.has(file) &&
					PRODUCTION_FACTORY_CALL.some(function matches(pattern) {
						return pattern.test(source)
					})
				)
			}),
			staleEntries: staleEntries(PRODUCTION_FACTORY_TEST_FILES),
		}).toEqual({ openWithTheFactory: [], staleEntries: [] })
	})

	it('no test helper uses a browser-only XML API', () => {
		expect(
			testHelpers().flatMap(function offendersOf(file) {
				return browserOnlyXmlApisOf(readText(file)).map(function offender(api) {
					return `${file}: ${api}`
				})
			}),
		).toEqual([])
	})

	it('the XML API check sees each API it bans, and not a library read through its namespace', () => {
		expect({
			samples: BROWSER_ONLY_XML_APIS.map(function sampleApis(api) {
				return browserOnlyXmlApisOf(api.sample)
			}),
			library: browserOnlyXmlApisOf(
				'new lib.DOMParser().parseFromString(xml, type); new lib.XMLSerializer(); await page.evaluate(read)',
			),
		}).toEqual({
			samples: BROWSER_ONLY_XML_APIS.map(function sampleName(api) {
				return [api.name]
			}),
			library: [],
		})
	})

	it(
		'no node-environment project installs a DOM, XPath or IndexedDB stand-in, the mutation runs included',
		{
			timeout: 30_000,
		},
		() => {
			const setupFiles = nodeEnvironmentProjects().flatMap(setupFilesOf)
			expect(
				[...reachedFrom(setupFiles)].flatMap(function standInsOf(file) {
					return standInsInstalledBy(readText(file)).map(function offender(standIn) {
						return `${file}: ${standIn}`
					})
				}),
			).toEqual([])
		},
	)

	it(
		"the fast mutation runs test the node project's files on its setup, in node",
		{ timeout: 30_000 },
		() => {
			const nodeTier = tierShapeOf(projectNamed(NODE_PROJECT_NAME))
			expect(
				VITEST_MUTATION_RUNS.map(function runOf(path) {
					const config = readMutationRunConfig(path)
					return {
						path,
						testRunner: config.testRunner,
						related: config.vitest?.related,
						projects: projectsOfMutationRun(path).map(tierShapeOf),
					}
				}),
			).toEqual(
				VITEST_MUTATION_RUNS.map(function nodeRunOf(path) {
					return { path, testRunner: 'vitest', related: false, projects: [nodeTier] }
				}),
			)
		},
	)

	it(
		'the projects printer writes the JSON alone on stdout when the config logs',
		{
			timeout: 30_000,
		},
		() => {
			expect(printProjects({ configFile: LOGGING_CONFIG_FIXTURE, environment: {} })).toEqual([
				LOGGING_CONFIG_PROJECT,
			])
		},
	)

	it('the projects printer reads a config as the guard reads it in process', () => {
		expect(printedProjectsOf({ config: vitestConfig }).map(toProject)).toEqual(configuredProjects())
	})

	it('the full mutation run tests the projects of test:browser:all', () => {
		const command = readMutationRunConfig(MUTANTS_PATHS.fullConfig).commandRunner?.command ?? ''
		expect(projectsNamedBy(command)).toEqual(
			projectsRunBy([readManifest().scripts[BROWSER_ALL_SCRIPT] ?? '']),
		)
	})

	it('no stand-in package is listed or imported, but by a declared importer', () => {
		const declared = new Set(STAND_IN_PACKAGE_IMPORTERS.map(pathOf))
		const importers = sourceFiles().filter(function importsAStandIn(file) {
			return [...readText(file).matchAll(IMPORT_SPECIFIER)].some(function namesAStandIn(match) {
				return standInPackagesOf(match[1]).length > 0
			})
		})
		const imported = new Set(
			STAND_IN_PACKAGE_IMPORTERS.flatMap(function packagesOf(entry) {
				return [...readText(entry.path).matchAll(IMPORT_SPECIFIER)].flatMap(function named(match) {
					return standInPackagesOf(match[1])
				})
			}),
		)
		const { dependencies, devDependencies, peerDependencies } = readManifest()
		const listed = Object.keys({ ...dependencies, ...devDependencies, ...peerDependencies })
		expect({
			undeclaredImporters: importers.filter(function isUndeclared(file) {
				return !declared.has(file)
			}),
			listedWithoutImporter: listed.filter(function isUnimportedStandIn(name) {
				return standInPackagesListedAs(name).some(function isUnimported(standIn) {
					return !imported.has(standIn)
				})
			}),
			staleEntries: staleImporters(),
		}).toEqual({ undeclaredImporters: [], listedWithoutImporter: [], staleEntries: [] })
	})

	it('the stand-in check sees each package it bans, a subpath, a scope, a require call and a type package included', () => {
		const installed = standInsInstalledBy(
			[
				"import { JSDOM } from 'jsdom'",
				"import { Window } from 'happy-dom'",
				"import { GlobalRegistrator } from '@happy-dom/global-registrator'",
				"const { indexedDB } = require('fake-indexeddb')",
				"const localRequire = createRequire(import.meta.url); localRequire('fake-indexeddb/auto')",
				"import { select } from 'xpath'",
				"const xpathPath = require.resolve('xpath')",
				'Object.assign(globalThis, { document })',
			].join('\n'),
		)
		expect({
			installed,
			distinct: [...new Set(installed)].sort(),
			listed: [
				'@types/jsdom',
				'happy-dom',
				'@happy-dom/global-registrator',
				'xpath-ts',
				'vitest',
			].map(standInPackagesListedAs),
		}).toEqual({
			installed: [
				'jsdom',
				'happy-dom',
				'@happy-dom',
				'fake-indexeddb',
				'fake-indexeddb',
				'xpath',
				'xpath',
				BROWSER_GLOBAL_SET_BY_HAND.name,
			],
			distinct: [...new Set([...STAND_IN_PACKAGES, BROWSER_GLOBAL_SET_BY_HAND.name])].sort(),
			listed: [['jsdom'], ['happy-dom'], ['@happy-dom'], [], []],
		})
	})

	it('the browser projects never select the in-memory store', () => {
		expect(
			configuredProjects()
				.filter(isInBrowser)
				.filter(function selectsInMemoryStore(project) {
					return project.setupFiles.some(usesInMemoryStore)
				})
				.map(function projectName(project) {
					return project.name
				}),
		).toEqual([])
	})

	it('the corpus checks run in the browser, never in the node project', () => {
		const corpusFiles = new Set(corpusTestFiles())
		const nodeFiles = filesOfProject(projectNamed(NODE_PROJECT_NAME))
		expect({
			corpusProjectsInBrowser: configuredProjects()
				.filter(function runsCorpus(project) {
					return filesOfProject(project).some(function isCorpus(file) {
						return corpusFiles.has(file)
					})
				})
				.every(isInBrowser),
			corpusFilesInNode: nodeFiles.filter(function isCorpus(file) {
				return corpusFiles.has(file)
			}),
		}).toEqual({ corpusProjectsInBrowser: true, corpusFilesInNode: [] })
	})

	it('test:browser:all runs the whole suite but the node-only list in a browser', () => {
		const projects = projectsRunBy([readManifest().scripts[BROWSER_ALL_SCRIPT] ?? '']).map(
			projectNamed,
		)
		expect({
			files: sorted(projects.flatMap(filesOfProject)),
			allInBrowser: projects.every(isInBrowser),
		}).toEqual({
			files: without({ files: unitTestFiles(), left: NODE_ONLY_TEST_FILES }),
			allInBrowser: true,
		})
	})

	it('a pull request runs test:browser:all before merge', () => {
		const browserAllProjects = projectsRunBy([readManifest().scripts[BROWSER_ALL_SCRIPT] ?? ''])
		const ciProjects = new Set(projectsRunBy(workflowRunLines(TEST_WORKFLOW)))
		const pullRequest = readText(PULL_REQUEST_WORKFLOW)
		expect({
			onPullRequest:
				PULL_REQUEST_TRIGGER.test(pullRequest) && pullRequest.includes(`uses: ./${TEST_WORKFLOW}`),
			runsBrowserAll:
				browserAllProjects.length > 0 &&
				browserAllProjects.every(function ranByCi(project) {
					return ciProjects.has(project)
				}),
		}).toEqual({ onPullRequest: true, runsBrowserAll: true })
	})

	it('the test script runs the node project, then the browser list', () => {
		expect(tierRunOf([readManifest().scripts.test ?? ''])).toEqual(nodeThenBrowserList())
	})

	it('the fast gate runs the node project only', () => {
		expect(tierRunOf(readManifest().dialecte.gate.fast.map(stepRun))).toEqual({
			first: NODE_PROJECT_NAME,
			thenFiles: [],
			thenAllInBrowser: true,
		})
	})

	it('the full gate runs the node project, then the browser list', () => {
		expect(tierRunOf(readManifest().dialecte.gate.full.map(stepRun))).toEqual(nodeThenBrowserList())
	})
})
