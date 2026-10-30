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

/** A module specifier of an import or re-export (static or dynamic). */
export const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g

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

/** A setup standing in for the browser: a DOM library, fake IndexedDB, or browser globals set by hand. */
export const DOM_STAND_INS = [
	{ name: 'jsdom', pattern: /['"]jsdom['"]/ },
	{ name: 'happy-dom', pattern: /['"]happy-dom['"]|['"]@happy-dom\// },
	{ name: 'fake-indexeddb', pattern: /['"]fake-indexeddb/ },
	{
		name: 'a browser global set by hand',
		pattern:
			/globalThis\s*(?:\.\s*\w+|\[[^\]]+\])\s*=|Object\.(?:assign|defineProperty|defineProperties)\(\s*globalThis\b|vi\.stubGlobal\(/,
	},
] as const

/** The workflow a pull request runs, and the test workflow it calls. */
export const PULL_REQUEST_WORKFLOW = '.github/workflows/pr.yml'
export const TEST_WORKFLOW = '.github/workflows/_test.yml'

/** A workflow's `pull_request` trigger. */
export const PULL_REQUEST_TRIGGER = /^\s+pull_request:/m

/** A workflow step's `run:` line: its command, or `|` / `>` when a block follows. */
export const WORKFLOW_RUN_LINE = /^(\s*)(?:-\s+)?run:\s*(.*)$/
