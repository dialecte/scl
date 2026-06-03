---
description: Test helpers for @dialecte/scl v2019C1 — createSclTestProject, runSclTestCases, XML assertions, and namespace constants.
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
}): Promise<SclTest.TestProjectResult>
```

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

const { project, source } = await createSclTestProject({
	sourceXml: `
		<SCL ${ALL_XMLNS_NAMESPACES}>
			<Substation name="S1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="s1">
				<VoltageLevel name="V1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="vl1"/>
			</Substation>
		</SCL>
	`,
})

try {
	const vls = await source.document.query.getChildren(
		{ tagName: 'Substation', id: 's1' },
		'VoltageLevel',
	)
	expect(vls).toHaveLength(1)
} finally {
	await project.destroy()
}
```

Use `runSclTestCases` when the test fits the standard source → act → assert shape. Use `createSclTestProject` directly when:

- Asserting intermediate states between transactions
- Multiple exports at different stages

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

`assertExpectedElementQueries` and `assertUnexpectedElementQueries` run XPath assertions against an `XMLDocument`. Both use the SCL namespace map.

Use directly when calling `createSclTestProject` and exporting manually via `project.export(documentId)`.

```ts
assertExpectedElementQueries({ xmlDocument, queries: ['//default:Substation[@name="S1"]'] })
assertUnexpectedElementQueries({ xmlDocument, queries: ['//default:Bay[@name="deleted"]'] })
```

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

## SclTest type namespace

All types are bound to the SCL dialecte config via the `SclTest` namespace:

| Type                        | Description                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `SclTest.BaseTestCase`      | `{ only?: boolean }` - minimal base for non-XML tests (e.g. `runSclTestCases.generic`)               |
| `SclTest.BaseXmlTestCase`   | `BaseTestCase & { sourceXml, targetXml?, expectedQueries?, unexpectedQueries? }` - XML tests         |
| `SclTest.TestCases<T>`      | `Record<string, T>` - key is the test description. Defaults to `BaseXmlTestCase`                     |
| `SclTest.TestDocument`      | `{ documentId: string, document: Scl.Document }` - pre-opened document inside the test project       |
| `SclTest.TestProjectResult` | `{ project, source: TestDocument, target?: TestDocument }` - returned by `createSclTestProject`      |
| `SclTest.ActParams<T>`      | `{ project, source, target?, testCase }` - passed to `act`                                           |
| `SclTest.ActResult`         | `{ assertOn?: 'source' \| 'target', withDatabaseIds?: boolean }` - returned by `act` in `withExport` |
| `SclTest.TestRunner`        | Runner type bound to SCL config                                                                      |

`TestCases<T>` accepts any type extending `BaseTestCase` - use `BaseTestCase` for non-XML generic tests, `BaseXmlTestCase` for XML round-trip tests:

````ts
// Non-XML test case (generic runner)
type MyCase = SclTest.BaseTestCase & { input: number; expected: number }
const cases: SclTest.TestCases<MyCase> = { ... }
runSclTestCases.generic(cases, (testCase) => { ... })

// XML test case (withExport / withoutExport)
type MyXmlCase = SclTest.BaseXmlTestCase & { functionId: string }
const cases: SclTest.TestCases<MyXmlCase> = { ... }
runSclTestCases.withExport({ testCases: cases, act })onfig                                                              |

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
````
