---
description: Test helpers for @dialecte/scl v2019C1 — createSclTestDialecte, runSclTestCases, XML assertions, and namespace constants.
---

# Test Helpers

`@dialecte/scl` ships a test entry point with SCL-specific utilities. Import from `@dialecte/scl/v2019C1/test`:

```ts
import {
	runSclTestCases,
	createSclTestDialecte,
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

Use when `act` performs transactions and assertions must run on the exported XML via XPath. `assertDatabaseName` is **required** in the returned `ActResult`.

```ts
import { describe } from 'vitest'
import { runSclTestCases, ALL_XMLNS_NAMESPACES } from '@dialecte/scl/v2019C1/test'
import type { SclTest } from '@dialecte/scl/v2019C1/test'

type TestCase = SclTest.BaseTestCase & {
	params: AddHistoryEntryParams
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
		await addHistoryEntry(tx, testCase.params)
	})
	return { assertDatabaseName: source.databaseName }
}

describe('addHistoryEntry', () => {
	runSclTestCases.withExport({ testCases, act })
})
```

After `act` returns, `runSclTestCases.withExport` exports the named database and runs XPath assertions from `expectedQueries` / `unexpectedQueries`.

Use `runSclTestCases.withoutExport` when no export is needed — `act` returns `Promise<void>`, XPath assertions are skipped.

---

## createSclTestDialecte

Lower-level helper for tests that need manual control over intermediate assertions, multi-step verification, or transactions outside `runSclTestCases`.

```ts
async function createSclTestDialecte(params: { xmlString: string }): Promise<{
	document: Document<SclConfig>
	databaseName: string
	cleanup: () => Promise<void>
	exportCurrentTest: (params?: {
		extension?: string
		withDatabaseIds?: boolean
	}) => Promise<{ xmlDocument: XMLDocument; filename: string }>
}>
```

```ts
import {
	createSclTestDialecte,
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@dialecte/scl/v2019C1/test'

const { document, cleanup } = await createSclTestDialecte({
	xmlString: `
		<SCL ${ALL_XMLNS_NAMESPACES}>
			<Substation name="S1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="s1">
				<VoltageLevel name="V1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="vl1"/>
			</Substation>
		</SCL>
	`,
})

try {
	const vls = await document.query.getChildren({ tagName: 'Substation', id: 's1' }, 'VoltageLevel')
	expect(vls).toHaveLength(1)
} finally {
	await cleanup()
}
```

Use `runSclTestCases` when the test fits the standard source → act → assert shape. Use `createSclTestDialecte` directly when:

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

Use directly when calling `createSclTestDialecte` and exporting manually with `exportXmlFile`.

```ts
assertExpectedElementQueries({ xmlDocument, queries: ['//default:Substation[@name="S1"]'] })
assertUnexpectedElementQueries({ xmlDocument, queries: ['//default:Bay[@name="deleted"]'] })
```

---

## Stable record IDs with dev:db-id

`createSclTestDialecte` always imports with `useCustomRecordsIds: true`. Any `dev:db-id` attribute in the XML becomes the actual database record ID — no lookups needed in `act`.

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

| Type                   | Description                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `SclTest.BaseTestCase` | `BaseXmlTestCase` — `{ sourceXml, targetXml?, only?, expectedQueries?, unexpectedQueries? }` |
| `SclTest.TestCases<T>` | `Record<string, T>` — key is the test description                                            |
| `SclTest.ActParams<T>` | `{ source, target?, testCase }` — passed to `act`                                            |
| `SclTest.ActResult`    | `{ assertDatabaseName: string, withDatabaseIds?: boolean }`                                  |

```ts
import type { SclTest } from '@dialecte/scl/v2019C1/test'
```
