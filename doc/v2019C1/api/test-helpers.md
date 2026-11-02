---
description: Test helpers for @dialecte/scl v2019C1 — createSclTestProject, runSclTestCases, the checks of fixtures and of the documents a test leaves, XML assertions, and namespace constants.
---

# Test Helpers

`@dialecte/scl` ships a test entry point with SCL-specific utilities. Import from `@dialecte/scl/v2019C1/test`:

```ts
import {
	runSclTestCases,
	createSclTestProject,
	createSclTestRecord,
	assertExpectedElementQueries,
	assertUnexpectedElementQueries,
	assertValidSclXml,
	assertCoherentSclReferences,
	collectSclOutputViolations,
	assertNoNewSclOutputViolations,
	openSclDocument,
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@dialecte/scl/v2019C1/test'
```

All helpers are wired to the SCL config internally — no config argument needed.

## runSclTestCases

Table-driven async runner backed by a real in-memory database. Pre-bound to the SCL dialecte config.

Two methods enforce the right contract at call-site.

| Method                          | Use when                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `runSclTestCases.withExport`    | `act` performs transactions, assertions on exported XML (`Promise<SclTest.ActResult>`) |
| `runSclTestCases.withoutExport` | `act` asserts directly on query results (`Promise<void>`)                              |
| `runSclTestCases.generic`       | Sync pure-function tests — no XML, no DB                                               |

### Scenario 1 - query assertions only (act returns void)

Use when `act` asserts directly on query results via `expect`. No XML export needed.

```ts
import { describe, expect } from 'vitest'
import {
	runSclTestCases,
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@dialecte/scl/v2019C1/test'
import type { SclTest } from '@dialecte/scl/v2019C1/test'

type TestCase = SclTest.BaseTestCase & {
	expectedOrder: { version: string; revision: string }[]
}

const testCases: SclTest.TestCases<TestCase> = {
	'no History element → empty array': {
		sourceXml: `<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1"/>`,
		expectedOrder: [],
	},
	'two Hitems out of order → sorted ascending': {
		sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES}>
				<Header id="h" toolID="T" fileType="SCD" version="2" revision="1"
					uuid="u1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="header-1">
					<History ${CUSTOM_RECORD_ID_ATTRIBUTE}="history-1">
						<Hitem version="2" revision="1" when="now" who="u" what="w" why="y"
							${CUSTOM_RECORD_ID_ATTRIBUTE}="hitem-1"/>
						<Hitem version="1" revision="1" when="now" who="u" what="w" why="y"
							${CUSTOM_RECORD_ID_ATTRIBUTE}="hitem-2"/>
					</History>
				</Header>
			</SCL>
		`,
		expectedOrder: [
			{ version: '1', revision: '1' },
			{ version: '2', revision: '1' },
		],
	},
}

async function act({ source, testCase }: SclTest.ActParams<TestCase>): Promise<void> {
	const sorted = await getSortedHitems(source.document.query)
	const result = sorted.map((h) => ({
		version: h.attributes.find((a) => a.name === 'version')?.value ?? '',
		revision: h.attributes.find((a) => a.name === 'revision')?.value ?? '',
	}))
	expect(result).toEqual(testCase.expectedOrder)
}

describe('getSortedHitems', () => {
	runSclTestCases.withoutExport({ testCases, act })
})
```

### Scenario 2 - XML export assertions (act returns ActResult)

Use when `act` performs transactions and assertions must run on the exported XML via XPath. `act` returns an optional `ActResult` to choose which document to assert on (defaults to `source`) and toggle `withDatabaseIds`.

```ts
import { describe } from 'vitest'
import { runSclTestCases, ALL_XMLNS_NAMESPACES } from '@dialecte/scl/v2019C1/test'
import type { SclTest } from '@dialecte/scl/v2019C1/test'

type TestCase = SclTest.BaseXmlTestCase & {
	params: {
		version: string
		revision: string
		when: string
		who: string
		what: string
		why: string
	}
}

const testCases: SclTest.TestCases<TestCase> = {
	'adds Hitem under History → Hitem present in export': {
		sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES}>
				<Header id="my-id" toolID="SET" fileType="SCD" uuid="u1" version="1" revision="A"/>
			</SCL>
		`,
		params: { version: '2', revision: 'B', when: '2026-01-01', who: 'user', what: 'init', why: '' },
		expectedQueries: [
			'//default:Header/default:History/default:Hitem[@version="2"][@revision="B"]',
		],
	},
}

async function act({ source, testCase }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
	await source.document.transaction(async (tx) => {
		await tx.history.addEntry(testCase.params)
	})
	return { assertOn: 'source' }
}

describe('addEntry', () => {
	runSclTestCases.withExport({ testCases, act })
})
```

After `act` returns, `runSclTestCases.withExport` exports the chosen document and runs XPath assertions from `expectedQueries` / `unexpectedQueries`.

Use `runSclTestCases.withoutExport` when no export is needed — `act` returns `Promise<void>`, XPath assertions are skipped.

---

## createSclTestProject

Lower-level helper for tests that need manual control over intermediate assertions, multi-step verification, or transactions outside `runSclTestCases`. Spins up a real in-memory `Project` with the source (and optionally target) file imported, and returns pre-opened documents.

```ts
async function createSclTestProject(params: {
	sourceXml: string
	targetXml?: string
	dev?: { perf?: boolean }
	/** Why the fixtures need an incoherent reference: they are then left unchecked. */
	allowIncoherentReferences?: string
	/** Why the test leaves a document a real file could not be: the documents are then left unchecked. */
	allowInvalidOutput?: string
}): Promise<SclTest.TestProjectResult>
```

Call it inside a test. The test owns the project until it finishes; then the documents it leaves are checked (see
[The documents a test leaves are checked too](#the-documents-a-test-leaves-are-checked-too)) and the project is
destroyed. Do not call `project.destroy()` yourself: the check needs the project, and the destroy happens whatever it
finds.

The returned `TestProjectResult` shape:

```ts
{
	project: Scl.Project
	source: { documentId: string; document: Scl.Document }
	target?: { documentId: string; document: Scl.Document }
}
```

```ts
import {
	createSclTestProject,
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@dialecte/scl/v2019C1/test'

const { source } = await createSclTestProject({
	sourceXml: `
		<SCL ${ALL_XMLNS_NAMESPACES}>
			<Substation name="S1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="s1">
				<VoltageLevel name="V1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="vl1"/>
			</Substation>
		</SCL>
	`,
})

const vls = await source.document.query.getChildren(
	{ tagName: 'Substation', id: 's1' },
	'VoltageLevel',
)
expect(vls).toHaveLength(1)
```

Use `runSclTestCases` when the test fits the standard source → act → assert shape. Use `createSclTestProject` directly when:

- Asserting intermediate states between transactions
- Multiple exports at different stages

## openSclDocument

Imports one more document into a test project — a previous revision of a file, a third file the act reads — and opens
it. Its XML is checked as a fixture is (by structure, then for coherent references), and its records keep the ids the
XML names, like the source and the target. The project owns it: it goes when the project goes, and the documents the
test leaves are checked as before (what it held when imported is carried, not gained).

```ts
async function openSclDocument(params: {
	project: Scl.Project
	xml: string
	/** Names the document in a refusal and in the file name it is imported under. */
	label: string
	/** Why the document needs an incoherent reference: it is then left unchecked for them. */
	allowIncoherentReferences?: string
}): Promise<Scl.Document>
```

```ts
async function act({ testCase, project, source, target }: SclTest.ActParams<TestCase>) {
	const previous = await openSclDocument({
		project,
		xml: testCase.baseXml,
		label: 'previous revision',
	})
	// ... read previous.query beside source.query
}
```

---

## createSclTestRecord

Factory for typed in-memory records without a database. Useful for unit-testing pure functions that operate on `RawRecord` or `TrackedRecord`.

```ts
const record = createSclTestRecord({
	record: { tagName: 'VoltageLevel', attributes: { name: 'VL1' } },
})
```

---

## XML assertions

`assertExpectedElementQueries` and `assertUnexpectedElementQueries` run XPath assertions against XML text, parsed once per call. Both use the SCL namespace map. A caller holding a page `Document` serializes it first.

Use directly when calling `createSclTestProject` and reading the XML yourself, for example with `document.query.getSnapshot({ as: 'xml' })`.

```ts
const xml = (await document.query.getSnapshot({ as: 'xml' })) as string
assertExpectedElementQueries({ xml, queries: ['//default:Substation[@name="S1"]'] })
assertUnexpectedElementQueries({ xml, queries: ['//default:Bay[@name="deleted"]'] })
```

A failure says why in labelled lines: the steps of the query that matched, the step that failed, where the last match sits and what the failing step finds there without its predicates. Text that is not well-formed fails as `queried XML: malformed XML - <line>:<column> <reason>`.

---

## Stable record IDs with dev:db-id

`createSclTestProject` always imports with `useCustomRecordsIds: true`. Any `dev:db-id` attribute in the XML becomes the actual database record ID — no lookups needed in `act`.

```xml
<Substation name="S1" dev:db-id="s1">
	<VoltageLevel name="V1" dev:db-id="vl1"/>
</Substation>
```

```ts
// Reference by stable ID directly
await tx.addChild(
	{ tagName: 'VoltageLevel', id: 'vl1' },
	{ tagName: 'Bay', attributes: { name: 'B1' } },
)
```

Because `runSclTestCases` exports with `withDatabaseIds: true`, XPath can assert by ID:

```ts
expectedQueries: ['//default:VoltageLevel[@dev:db-id="vl1"]/default:Bay[@name="B1"]']
```

### Deterministic UUIDs for new elements

During `act`, `crypto.randomUUID` is replaced with a counter mock — IDs for newly created elements are `"0"`, `"1"`, `"2"`, ... in creation order. Setup always uses real UUIDs to avoid collisions between parallel tests.

---

## Namespace constants

| Constant                     | Value                                                            |
| ---------------------------- | ---------------------------------------------------------------- |
| `XMLNS_SCL_NAMESPACE`        | `xmlns="http://www.iec.ch/61850/2003/SCL"`                       |
| `XMLNS_SCL_6_100_NAMESPACE`  | `xmlns:eIEC61850-6-100="http://www.iec.ch/61850/2019/SCL/6-100"` |
| `ALL_XMLNS_NAMESPACES`       | Both SCL namespaces + dev namespace combined                     |
| `CUSTOM_RECORD_ID_ATTRIBUTE` | `dev:db-id="..."` — attribute string for use in XML fixtures     |

```ts
const xml = `<SCL ${ALL_XMLNS_NAMESPACES}><Substation name="S1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="s1"/></SCL>`
```

XPath queries against SCL documents must use the `default:` prefix for all element names (SCL uses a default namespace). Attributes don't need a prefix unless qualified (e.g. `dev:db-id`).

```ts
// ✗ fails silently — no prefix
expectedQueries: ['//Substation[@name="S1"]']

// ✓ correct
expectedQueries: ['//default:Substation[@name="S1"]']
```

---

## Test XML is validated against the schema

`createSclTestProject` and `runSclTestCases` validate every fixture's `sourceXml` / `targetXml` against the SCL schema before the test runs (via `assertValidSclXml`), so an invalid snippet fails fast with a clear message instead of silently exercising a tree the engine misreads (element matching keys on the local tag name, so a wrong namespace would otherwise pass unnoticed).

What is checked:

- **element namespace** — each element sits in the namespace the schema declares for it **in its parent context**. SCL reuses local names across namespaces (e.g. `SclFileReference` is default-namespace under an IED but `eIEC61850-6-100` under a `FunctionSclRef`), so the check is context-aware. Writing a default-namespace element such as `Function` under the `eIEC61850-6-100:` prefix — or a 6-100 element such as `FunctionCatRef` in the default namespace — is rejected;
- **containment** — each element is an allowed child of its parent;
- **attributes** — every attribute, in whatever namespace, is a known attribute of its element: declared by the element (as declared under its parent and as the type it names with `xsi:type` says; a dialecte namespace under any prefix the document binds), or allowed by the element's attribute wildcard. Namespace declarations (`xmlns`), `xsi:*` and the record id `dev:db-id` are always allowed. A fixture carrying an attribute its element does not declare fails.

What is skipped:

- **elements in a namespace the SCL config does not declare** — vendor content under a `Private`, even when its local name collides with a schema element (a vendor `Address`, `P`, `Val`…). Such an element is opaque: neither its namespace, its place under its parent, nor its attributes are checked, the same way import keeps it verbatim. A schema element nested inside it is still checked on its own namespace and attributes. An element in **no** namespace is not foreign — it is a schema element the snippet forgot to put in its namespace (typically an `<SCL>` root written without `${ALL_XMLNS_NAMESPACES}`), and is rejected;
- **elements unknown to the schema** — bespoke content under a `Private`.

How failures are reported:

- `runSclTestCases` checks **every** case of the suite before it runs and fails once, listing the violations of all invalid cases, each attributed to its case name and to `sourceXml` / `targetXml` — a suite's fixtures are fixed in one round;
- text that is not well-formed fails as `<label>: malformed XML - <line>:<column> <reason>`;
- an XML declaration (`<?xml … ?>`) that is not the very first characters of the string is malformed XML. A template-literal snippet starts with a newline, so drop the declaration from inline fixtures — the message says so instead of relaying the parser's error.

Not enforced on fixtures: attribute value facets (uuid pattern, enums) and cross-element constraints (unique keys, keyref resolution). The documents a test leaves are held to them (see [The documents a test leaves are checked too](#the-documents-a-test-leaves-are-checked-too)).

Required-attribute completeness is checked by `assertValidSclXml` unless `requireComplete: false` is passed. `createSclTestProject` and `runSclTestCases` pass `false` for their fixtures, so a minimal fixture may omit e.g. the `<SCL>` `version` / `revision` / `release`:

```ts
import { assertValidSclXml } from '@dialecte/scl/v2019C1/test'

assertValidSclXml({ xml, label: 'my snippet' }) // required attributes checked
assertValidSclXml({ xml, label: 'my snippet', requireComplete: false })
```

## Test XML is checked for coherent references

`createSclTestProject` and `runSclTestCases` also check that the references written in a fixture are ones a real file could contain, right after the schema check and before the test runs. A fixture that writes a path no element has, or a uuid nothing carries, otherwise exercises reference handling on data that cannot occur.

The fixture is read as written: imported into a test project of its own, with no hook (nothing fills or repairs a
reference), and its record tree checked; the project goes after. Text that is not well-formed gives no reference
finding (the schema check reports it); any other refusal of the import (one record id given twice) is thrown. The
check is asynchronous: `await assertCoherentSclReferences({ xml, label })` - a call left un-awaited checks nothing.
An empty attribute is stored as absent, so an empty uuid reads as no uuid.

What is checked, for every reference that carries a uuid (`functionUuid`, `allocationRoleUuid`, `sourceLNodeUuid`, …):

- **dangling** — no element of the same document carries that uuid;
- **wrong-target** — the uuid is carried by an element the reference cannot point at (a `FunctionRef` whose `functionUuid` is the uuid of an `AllocationRole`);
- **path** — the written path is not the path of the element the uuid points at. The message gives the path to write:

```
my case › sourceXml: incoherent references:
  [path] <FunctionRef> function="TEMPLATE/Prot" is not the path of the element functionUuid="fn-uuid" points at, which is "TEMPLATE/TEMPLATE/TEMPLATE/Prot"
```

What is left alone:

- **a reference written by path only**, with no uuid attribute;
- **the path of a data or signal reference** — a path that carries a data qualifier or addresses a dataflow input or output (`SourceRef`, `ControlRef`, `LNodeInputRef`, `LNodeOutputRef`, `DOS` / `SDS` / `DAS` mappings, …). Their uuid is still checked;
- **elements in a namespace the SCL config does not declare**, as for the schema check.

`runSclTestCases` checks every case of the suite in a `beforeAll`, before the first case runs (bounded at two minutes),
and fails once, listing every incoherent reference under its case name and `sourceXml` / `targetXml`. The
documents a test leaves are checked on their record tree (`document.query.getSnapshot({ as: 'tree' })`), with no parse.

### A case that needs an incoherent reference

A test about an orphan to clean up, or a stale uuid, needs the very thing the check rejects. Such a case says why, and its fixtures are then left unchecked:

```ts
const testCases: SclTest.TestCases<TestCase> = {
	'FunctionRef with missing target → deleted': {
		allowIncoherentReferences: 'the reference pointing at nothing is what the clean-up handles',
		sourceXml: /* xml */ `…`,
	},
}
```

`createSclTestProject` takes the same `allowIncoherentReferences` parameter. When the target was only left out of the fixture, add it rather than opting out.

`assertCoherentSclReferences` is exported for ad-hoc use:

```ts
import { assertCoherentSclReferences } from '@dialecte/scl/v2019C1/test'

assertCoherentSclReferences({ xml, label: 'my snippet' })
```

## The documents a test leaves are checked too

`runSclTestCases.withExport` / `.withoutExport` and `createSclTestProject` check the source and target documents
after the test wrote them: a case whose act leaves a document a real SCL file could not be fails, with one error
listing every violation under its case and document (`my case › target: the document left is not a valid SCL file:`).
The check runs after `act`, before the runner exports for `expectedQueries`; for `createSclTestProject`, when the test
finishes. An `act` that throws keeps its own error, and a test that failed already is not checked.

Each document is exported and checked, in this order (`SCL_OUTPUT_CHECK`):

- **schema** — the structural check the fixtures pass (namespace per context, allowed child, known attribute);
- **xsd** — the XSD validator (libxml2, `libxml2-wasm`, run in the test's browser) against the SCL schema and the
  6-100 schema: value patterns and enumerations, required attributes and children, unique keys and key references.
  This is the verdict. The schema files are not shipped with the package (see
  [Set up the schema check](#set-up-the-schema-check)); when the core validation covers the same ground, it replaces
  the validator behind the same function;
- **uniqueness** — two children of one parent with one key, for the unique and key constraints the parent declares (a
  `BehaviorDescription` holding two `InputVar varName="in1"`, two `LNode` of one function with one identity);
- **references** — the reference check the fixtures pass (dangling, wrong-target, path, empty);
- **identity** — a uuid used twice, a `templateUuid` shared by elements of two types or naming another type.

Only what the test **added** fails it. The violations of each document are read before the act and compared with
those after it by a key without record ids or positions (for the validator, without the list of what it expected
there, which changes with the siblings); a second copy of a violation the input held is new. A violation another
document of the project held before the act — the fixture the act copied from, a template imported during the act —
is carried, not added, once per copy it held: a second copy is new, and a violation the act writes into both the
source and the target is reported in both.

A test document is read as a hand-made one: a document without a `Header` is given one before the validator runs
(without it the validator checks nothing past the root's first child), and a value the schema refuses as a uuid is
read as a test uuid when it is written in lowercase letters, digits and dashes (`function-source-uuid`, the runner's
counter `0`, `1`, `2`...), or when a document of the project writes it as a uuid (`CB_APP`): the document itself before
the act, or another document before or after it. Any other value refused as a uuid (a name with a capital, a path) is
reported.

### Set up the schema check

The validator and the test runner are optional peer dependencies of `@dialecte/scl`: a package using the test helpers
installs them as dev dependencies.

```sh
npm install -D libxml2-wasm vitest
```

The IEC schema files (`SCL_XSD_FILE_NAMES`: the SCL schema of the 2007 C5 edition with its parts, and the 6-100
schema) are not shipped either: their licence is the IEC's (this package's own tests sync them, uncommitted, from the
create package's copy with `npm run xsd:sync`). Keep a copy in the package and say where it is, once, in a
setup file of the vitest project (`test.setupFiles`), before any test validates. Either a URL the test's browser
fetches each file from, or a loader giving their texts by file name:

```ts
// vitest.setup.ts
import { configureSclXsdSchemas } from '@dialecte/scl/v2019C1/test'

configureSclXsdSchemas({
	async load() {
		const files = import.meta.glob<string>('./schemas/*.xsd', { query: '?raw', import: 'default' })
		const texts: Record<string, string> = {}
		for (const [path, load] of Object.entries(files)) {
			texts[path.slice(path.lastIndexOf('/') + 1)] = await load()
		}
		return texts
	},
})
// or: configureSclXsdSchemas({ baseUrl: '/schemas' })
```

The schemas are read and parsed the first time a test validates. A configured source that lacks a schema file, or a
missing `libxml2-wasm`, fails the first check and says what is missing.

**Without schemas** (none configured: a fresh clone or a CI without the IEC files) the XSD validator does not run and
nothing fails for that reason: the other four checks run, `collectSclOutputViolations` reports which checks ran
(`checks`, without `xsd`), `isSclXsdConfigured()` says so, and a failure says it was
`checked without the XSD validator`. This package's own runs print one line saying the schemas are absent.

### A case that leaves an invalid document

A case that leaves an invalid document on purpose (an orphan the clean-up under test removes later, a bare element a
hook test creates to see what the hook writes) says why, and which violations it may leave: a check, and a kind within
it (`code`) when it names one. Only those are tolerated: any other violation the case adds still fails it, and a
tolerated violation it no longer leaves (for a check that ran) fails it too, so the opt-out goes when the case is
fixed. An empty reason or list is refused when the suite is registered:

```ts
const testCases: SclTest.TestCases<TestCase> = {
	'Terminal with a cNodeUuid naming no node → left as given': {
		allowInvalidOutput: {
			reason: 'the terminal names no node on purpose',
			violations: [{ check: 'references', code: 'dangling' }],
		},
		sourceXml: /* xml */ `…`,
	},
}
```

The codes (`SclOutputTolerance`): `schema` `namespace` / `containment` / `attribute`; `xsd` one of `SCL_XSD_CODE`
(`pattern`, `value`, `missing-child`, `unexpected-child`, `required-attribute`, `unknown-attribute`, `duplicate-key`,
`keyref`, `other`); `uniqueness` the constraint name; `references` `dangling` / `wrong-target` / `path` / `empty` /
`derived`; `identity` the warning code (`duplicate-instance-uuid`...). `createSclTestProject` takes the same
`allowInvalidOutput` parameter. When the fixture only lacks a part (a `Header`, a required child), complete it rather
than opting out.

`collectSclOutputViolations({ project, document })` reports the violations of one document and the checks that ran
(pass `asTestDocument: true` to read it as a hand-made one), and `assertNoNewSclOutputViolations({ before, after,
carried, checks, label, allowInvalidOutput })` throws with those `after` adds to `before`:

```ts
import {
	assertNoNewSclOutputViolations,
	collectSclOutputViolations,
} from '@dialecte/scl/v2019C1/test'

const before = await collectSclOutputViolations({ project, document: target.document })
// … the act …
const after = await collectSclOutputViolations({ project, document: target.document })
assertNoNewSclOutputViolations({
	before: before.violations,
	after: after.violations,
	checks: after.checks,
	label: 'my case › target',
})
```

## Test tiers of this package

The helpers need no browser API: they read XML with libxml2 (`libxml2-wasm`) and documents through the store. This
package runs its tests in two tiers (`vitest.config.ts`):

| Command                                | Project       | Runs                                                                                        | When                     |
| -------------------------------------- | ------------- | ------------------------------------------------------------------------------------------- | ------------------------ |
| `npx vitest run --project node <path>` | `node`        | every unit test file but the browser-only list, in node, on the in-memory store             | each step                |
| `npm run test:node`                    | `node`        | the same, whole                                                                             | each step, the fast gate |
| `npm run test:browser`                 | `browser`     | the browser-only list (`BROWSER_ONLY_TEST_FILES` in `vitest.config.constants.ts`), Chromium | the full gate            |
| `npm test`                             | both          | `test:node`, then `test:browser`                                                            | the commit hook          |
| `npm run test:browser:all`             | `browser-all` | every unit test file but the node-only list, in Chromium, on the local store                | before a merge (CI)      |

The `node` project's setup (`src/v2019C1/test/in-memory-storage.setup.ts`) calls core's
`useTestStorage({ type: 'inMemory' })`: the runner chooses the store, a test never names it. A browser-only file
says why (`{ path, why }`): a browser API (the page's IndexedDB). A test that passes in one tier and fails in the other
is a store or assertion bug to fix, never a file moved to the browser list. A package using the test helpers in node
gives its own node project the same setup line.

## Mutation testing of this package

This package's own tests are mutation-tested (StrykerJS): each change of the code a test should notice is made one at
a time, and the tests that reach it run. Two tiers, run from the package root:

```sh
npm run mutants:fast -- src/v2019C1/extensions/lifecycle/apply/apply.ts src/v2019C1/extensions/reference/transaction/write-provenance.ts:9-30
npm run mutants:fast -- --diff main          # the lines changed since main, the new source files whole
npm run mutants:full                          # the browser tier on what the fast tier left
npm run mutants -- --diff main --force        # both in turn, every mutant tested again
npm run test:mutants                          # the tests of the gate itself
```

The package also declares its mutation scope (`dialecte.mutation` in `package.json`: the source globs, the exclusions,
the error factories, the fast config and the full command) for the cli's runner (`@dialecte/cli` >= 0.2.0):
`npx dialecte mutants run --mode changed|audit`, `npx dialecte mutants status`. Its records live in
`.dialecte/mutation-records.json`. The scl scripts above (`npm run mutants*`) keep working until the cli runner replaces
them. While both exist, every record of `scripts/mutants/equivalent-mutants.json` is also in the records file (the
tier guard checks it: same key, reason, line and mutation); the records file may hold more, the ones the cli writes.

- **fast** runs the node tier: the files of the `node` vitest project, on its setup (the in-memory store, the output
  check on), under the name `mutation` the mutation config selects. No browser stand-in: the test helpers read XML
  with libxml2 and the store tree, in node as in a browser. StrykerJS's vitest runner runs, for each mutant, only the
  tests that reach it, in workers it keeps warm; the test files of a worker share their modules, as in the `node`
  project. A mutant that timed out runs again alone, with a longer limit: it stays a timeout only when it times out
  again. Without `--force` the results of a mutant whose code and tests did not change are taken from the last run;
  a change elsewhere (another source file, the vitest config, a dependency) is not seen, so the run before a commit
  takes `--force`.
- **full** runs the `browser-all` project (the whole suite in Chromium, as `npm run test:browser:all`) on each
  survivor the records do not list, at its location (with the mutants nested in it). A mutant either tier kills is
  killed. It refuses to run when a mutated file changed since the fast run. The browser-only test files
  (`BROWSER_ONLY_TEST_FILES` in `vitest.config.constants.ts`) run in the full tier only.

Every survivor is either killed by a new test or recorded in `scripts/mutants/equivalent-mutants.json`, with the reason
no output can differ. The gate fails on a survivor of the run the records do not list with a reason, and on a recorded
mutant the run killed (or, in a file mutated whole, no longer finds). `--record` writes the new survivors with an empty
reason to fill, and drops those stale records. A record is keyed by what the mutant changed (file, mutator, original
code, replacement, the text of its line), so moving a line keeps it; a second identical line is numbered. The reports
go to `.tmp/stryker/` (ignored).

---

## SclTest type namespace

All types are bound to the SCL dialecte config via the `SclTest` namespace:

| Type                        | Description                                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `SclTest.BaseTestCase`      | `{ only?: boolean }` - minimal base for non-XML tests (e.g. `runSclTestCases.generic`)                                                        |
| `SclTest.BaseXmlTestCase`   | `BaseTestCase & { sourceXml, targetXml?, expectedQueries?, unexpectedQueries?, allowIncoherentReferences?, allowInvalidOutput? }` - XML tests |
| `SclTest.TestCases<T>`      | `Record<string, T>` - key is the test description. Defaults to `BaseXmlTestCase`                                                              |
| `SclTest.TestDocument`      | `{ documentId: string, document: Scl.Document }` - pre-opened document inside the test project                                                |
| `SclTest.TestProjectResult` | `{ project, source: TestDocument, target?: TestDocument }` - returned by `createSclTestProject`                                               |
| `SclTest.ActParams<T>`      | `{ project, source, target?, testCase }` - passed to `act`                                                                                    |
| `SclTest.ActResult`         | `{ assertOn?: 'source' \| 'target', withDatabaseIds?: boolean }` - returned by `act` in `withExport`                                          |
| `SclTest.TestRunner`        | Runner type bound to SCL config                                                                                                               |

`TestCases<T>` accepts any type extending `BaseTestCase` - use `BaseTestCase` for non-XML generic tests, `BaseXmlTestCase` for XML round-trip tests:

```ts
// Non-XML test case (generic runner)
type MyCase = SclTest.BaseTestCase & { input: number; expected: number }
const cases: SclTest.TestCases<MyCase> = { ... }
runSclTestCases.generic(cases, (testCase) => { ... })

// XML test case (withExport / withoutExport)
type MyXmlCase = SclTest.BaseXmlTestCase & { functionId: string }
const cases: SclTest.TestCases<MyXmlCase> = { ... }
runSclTestCases.withExport({ testCases: cases, act })
```
