import type { DeclaredTestFile } from '../../vitest.config.types'

/** Every unit test file of the package, wherever it lives. */
export const UNIT_TEST_FILE_PATTERNS: readonly string[] = [
	'src/**/*.test.{js,ts,jsx,tsx}',
	'scripts/**/*.test.{js,ts,jsx,tsx}',
]

/** The corpus checks: their own browser projects, never unit tests. */
export const CORPUS_TEST_FILE_PATTERNS: readonly string[] = [
	'src/**/*.corpus.test.ts',
	'src/**/*.excluded.test.ts',
]

/** The node project's name: the tier a step runs. */
export const NODE_PROJECT_NAME = 'node'

/** The script running the whole suite in the browser, before a branch merges. */
export const BROWSER_ALL_SCRIPT = 'test:browser:all'

/** A command's `--project <name>` (or `--project=<name>`). */
export const PROJECT_FLAG = /--project[ =](\S+)/g

/** What separates the commands of a script line. */
export const COMMAND_SEPARATOR = /&&|\|\||;/

/** A command running another script of the package: `npm run <name>` (after env assignments or `nice`). */
export const NPM_RUN_COMMAND =
	/^(?:\w+=\S*\s+)*(?:nice(?:\s+-n\s*-?\d+)?\s+)?npm\s+(?:run|run-script)\s+(\S+)/

/** `npm test` or `npm t`: the `test` script. */
export const NPM_TEST_COMMAND = /^(?:\w+=\S*\s+)*(?:nice(?:\s+-n\s*-?\d+)?\s+)?npm\s+(?:test|t)\b/

/** npm-run-all's `run-s` / `run-p`: the scripts named after it (flags left out). */
export const RUN_ALL_COMMAND = /^(?:\w+=\S*\s+)*run-[sp]\s+(.+)$/

/** A setup selecting the in-memory store for its runner. */
export const IN_MEMORY_STORAGE_CALL = /useTestStorage\(\s*\{\s*type:\s*'inMemory'\s*\}\s*\)/

/** A test choosing its store: the runner's setup chooses it, never the test. */
export const STORE_NAMED = [/\bstorage\s*:\s*\{\s*type\s*:/, /\buseTestStorage\s*\(/]

/** A test opening a project with the production factory, past the test helpers and the runner's store. */
export const PRODUCTION_FACTORY_CALL = [/\bcreateSclProject\s*\(/, /\bnew\s+Project\s*[<(]/]

/** Folders a test file never lives in. */
export const IGNORED_FOLDERS: readonly string[] = ['**/node_modules/**', '**/dist/**', '**/.tmp/**']

/** The package's production entry: what it reaches is production code, not a test helper. */
export const PRODUCTION_ENTRY = 'src/v2019C1/index.ts'

/** The package's test entry: what it reaches is a test helper, unless production reaches it too. */
export const TEST_ENTRY = 'src/v2019C1/test/index.ts'

/** This guard's own folder: its constants name the APIs it bans. */
export const GUARD_FOLDER = 'scripts/test-tiers/'

/** This guard's test file: its samples name the packages it bans, so the package scan leaves it out. */
export const GUARD_TEST_FILE = 'scripts/test-tiers/test-tiers.test.ts'

/**
 * A module specifier of an import or re-export (static or dynamic), or of a require call: `require`, a function made by
 * `createRequire` and named after it (`localRequire`), and `require.resolve`.
 */
export const IMPORT_SPECIFIER =
	/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\b\w*[Rr]equire(?:\.resolve)?\s*\(\s*)['"]([^'"]+)['"]/g

/** The extensions an import without one resolves to, in vite's order. */
export const RESOLVED_SUFFIXES: readonly string[] = [
	'',
	'.ts',
	'.tsx',
	'.js',
	'/index.ts',
	'/index.js',
]

/**
 * The XML APIs only a browser page has. A bare name is the browser's global; a name read through a namespace import
 * (`library.DOMParser`) is a library's, not the page's.
 */
export const BROWSER_ONLY_XML_APIS = [
	{ name: 'DOMParser', pattern: /(?<![.\w$])DOMParser\b/, sample: 'new DOMParser()' },
	{ name: 'XMLSerializer', pattern: /(?<![.\w$])XMLSerializer\b/, sample: 'new XMLSerializer()' },
	{ name: 'XPathResult', pattern: /(?<![.\w$])XPathResult\b/, sample: 'XPathResult.ANY_TYPE' },
	{
		name: 'document.evaluate',
		pattern: /\w*[Dd]ocument\.evaluate\(/,
		sample: 'xmlDocument.evaluate(xpath)',
	},
	{
		name: 'xmlDocument export',
		pattern: /\bxmlDocument\s*:\s*true\b/,
		sample: 'project.export({ documentId, xmlDocument: true })',
	},
] as const

/**
 * The packages that stand in for the browser in node - DOM libraries, fake IndexedDB, an XPath engine - each a package
 * name or a scope (`@happy-dom`): a setup importing one stands in for the browser, and the node tier lists none.
 */
export const STAND_IN_PACKAGES: readonly string[] = [
	'jsdom',
	'happy-dom',
	'@happy-dom',
	'fake-indexeddb',
	'xpath',
]

/** The type package of a package (`@types/jsdom`): listed for its package, it counts as that package. */
export const TYPES_SCOPE = '@types/'

/** A setup standing in for the browser without a package: browser globals set by hand. */
export const BROWSER_GLOBAL_SET_BY_HAND = {
	name: 'a browser global set by hand',
	pattern:
		/globalThis\s*(?:\.\s*\w+|\[[^\]]+\])\s*=|Object\.(?:assign|defineProperty|defineProperties)\(\s*globalThis\b|vi\.stubGlobal\(/,
} as const

/** The workflow a pull request runs, and the test workflow it calls. */
export const PULL_REQUEST_WORKFLOW = '.github/workflows/pr.yml'
export const TEST_WORKFLOW = '.github/workflows/_test.yml'

/** A workflow's `pull_request` trigger. */
export const PULL_REQUEST_TRIGGER = /^\s+pull_request:/m

/** A workflow step's `run:` line: its command, or `|` / `>` when a block follows. */
export const WORKFLOW_RUN_LINE = /^(\s*)(?:-\s+)?run:\s*(.*)$/

/** The files allowed to import a stand-in package, each with why: a stand-in package is listed only while one exists. */
export const STAND_IN_PACKAGE_IMPORTERS: readonly DeclaredTestFile[] = []

/** The package's own source files, wherever they live: what may import a package. */
export const SOURCE_FILE_PATTERNS: readonly string[] = ['**/*.{ts,mts,cts,tsx,js,mjs,cjs,jsx,vue}']

/** The script printing a vitest config's projects as a run in its own environment loads them. */
export const PROJECTS_PRINTER = 'scripts/test-tiers/print-vitest-projects.ts'

/** The longest the projects printer may take: loading a config takes about a second. */
export const PROJECTS_PRINTER_TIMEOUT = 20_000

/** A config that logs while it loads: the projects printer must keep its stdout to the JSON. */
export const LOGGING_CONFIG_FIXTURE = 'scripts/test-tiers/fixtures/logging.vitest.config.ts'

/** The one project of the logging config, as the guard reads it. */
export const LOGGING_CONFIG_PROJECT = {
	name: 'logged',
	include: ['scripts/test-tiers/fixtures/none.test.ts'],
	exclude: [],
	setupFiles: [],
	environment: 'node',
	isolate: false,
	inBrowser: false,
} as const

/**
 * How long one guard case may take: each reads every source file of the package, and a commit hook runs it beside the
 * whole node suite on a loaded machine (5 s was crossed there while the same case takes under a second alone).
 */
export const TIER_GUARD_CASE_TIMEOUT_MS = 30_000

/** The variable that once gated the `mutation` project: gone from the package, named here to check it stays gone. */
export const LEGACY_MUTATION_PROJECT_ENV = 'SCL_MUTATION_PROJECT'

/** The vitest config the declared fast mutation run names. */
export const MUTATION_FAST_CONFIG = 'scripts/mutants/vitest.mutation.config.ts'

/** What the mutation scope leaves out, whatever else it lists. */
export const MUTATION_EXCLUDE_GLOBS: readonly string[] = [
	'**/*.constants.ts',
	'**/errors/**',
	'**/test/**',
	'**/*.test.ts',
]

/** The committed records of the mutation runs (the legacy file they were migrated from is `MUTANTS_PATHS.records`). */
export const MUTATION_RECORDS_FILE = '.dialecte/mutation-records.json'

/** What a "no environment" run of a mutation config unsets: the variable that once gated the project, wherever it came from. */
export const UNSET_FOR_NO_MUTATION_ENVIRONMENT: readonly string[] = [LEGACY_MUTATION_PROJECT_ENV]

/** How a failed projects printer run starts its text. */
export const PRINTER_FAILURE_PREFIX = 'the projects of '

/**
 * Glob syntax the cli refuses in a scope or exclude glob (braces, classes, extglobs): UNSUPPORTED_GLOB_SYNTAX in
 * cli-mutation-l2a src/lib/mutation/mutation.constants.ts:96, used by declaration.ts:31-39 (the cli reads `*` as one
 * segment and `**` as crossing segments, see the refusal text there).
 */
export const UNSUPPORTED_GLOB_SYNTAX = /[{[]|[!?+*@]\(/

/** Files the cli never mutates, whatever the scope says: NEVER_MUTABLE in the same constants file, line 28-29. */
export const NEVER_MUTABLE =
	/(?:\.test|\.types|\.d|\.generated|\.setup)\.ts$|(?:^|\/)(?:fixtures|__tests__)\//

/**
 * Every file of the package the gating variable must not appear in, dot folders included (a plain `**` never enters
 * them, so `.*\/**` names them: .github, .husky, .vitepress, .dialecte), whatever the extension.
 */
export const PACKAGE_FILE_PATTERNS: readonly string[] = ['**', '.*/**']

/** Folders outside the package's own files, and the guard's own files (they name the variable on purpose). */
export const VARIABLE_SCAN_EXCLUDED: readonly string[] = [
	'**/.git/**',
	'scripts/test-tiers/test-tiers.test.ts',
	'scripts/test-tiers/test-tiers.constants.ts',
]

/** The `--config` flag of a vitest command. */
export const CONFIG_FLAG = /--config[ =](\S+)/

/** The config a vitest command without `--config` runs on. */
export const DEFAULT_VITEST_CONFIG = 'vitest.config.ts'

/**
 * The families a mutation record may carry (a record with another family does not count for the cli):
 * MUTATION_FAMILIES, cli-mutation-l2a src/lib/mutation/mutation.constants.ts:4-14 (MUT-4). `mutants migrate` writes
 * `unclassified`; the cli's record verb writes the family it judged.
 */
export const MUTATION_FAMILIES: readonly string[] = [
	'invariant-guard',
	'fallback-never-taken',
	'exhaustive-default',
	'no-op-on-empty',
	'perf-shortcut',
	'static-init',
	'schema-default-read',
	'wording',
	'unclassified',
]

/** The keys `dialecte.mutation` may hold: MUTATION_DECLARATION_KEYS, cli-mutation-l2a src/lib/mutation/mutation.constants.ts:19 (declaration.ts:23-53, MUT-4). */
export const MUTATION_DECLARATION_KEYS: readonly string[] = [
	'scope',
	'exclude',
	'errorFactories',
	'fast',
	'full',
]

/** The keys `dialecte.mutation.fast` may hold: MUTATION_FAST_KEYS, cli-mutation-l2a mutation.constants.ts:70 (declaration.ts:44-47). */
export const MUTATION_FAST_KEYS: readonly string[] = ['vitestConfig']

/** The keys `dialecte.mutation.full` may hold: MUTATION_FULL_KEYS, cli-mutation-l2a mutation.constants.ts:71 (declaration.ts:48-52). */
export const MUTATION_FULL_KEYS: readonly string[] = ['command']

/** The only source extension the cli mutates: MUTABLE_EXTENSION, cli-mutation-l2a mutation.constants.ts:78. */
export const MUTABLE_EXTENSION = /\.ts$/
