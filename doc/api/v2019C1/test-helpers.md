---
description: Test helpers for @dialecte/scl v2019C1 — createSclTestDialecte, runSclTestCases, XML assertions, and namespace constants.
---

# Test Helpers

`@dialecte/scl` ships a test entry point with SCL-specific utilities for unit tests. Import from `@dialecte/scl/test`:

```ts
import {
	createSclTestDialecte,
	createSclTestRecord,
	runSclTestCases,
	assertExpectedElementQueries,
	assertUnexpectedElementQueries,
	XMLNS_SCL_NAMESPACE,
} from '@dialecte/scl/test'
```

All helpers are wired to the SCL config internally — no config argument needed.

## Creating a test dialecte

### `createSclTestDialecte`

Creates an in-memory dialecte from an XML string. Returns a query and transaction handle bound to an ephemeral IndexedDB instance. Used for full integration tests.

```ts
createSclTestDialecte(params: { xmlString: string }): Promise<{
  query: Scl.Query
  transaction: (fn: (tx: Scl.Transaction) => Promise<void>) => Promise<void>
}>
```

```ts
const { query, transaction } = await createSclTestDialecte({
	xmlString: `
		<SCL ${XMLNS_SCL_NAMESPACE}>
			<Substation name="S1">
				<VoltageLevel name="V1">
					<Bay name="B1"/>
				</VoltageLevel>
			</Substation>
		</SCL>
	`,
})

const root = await query.getRoot()
const { Bay: bays = [] } = await query.findDescendants(root)
expect(bays).toHaveLength(1)
```

### `createSclTestRecord`

Factory for typed in-memory records without a database. Useful for unit-testing pure functions that take a `RawRecord` or `TrackedRecord`.

```ts
const record = createSclTestRecord('VoltageLevel', { name: 'VL1', voltage: '110' })
// → Scl.TrackedRecord<'VoltageLevel'>
```

## Table-driven test runner

### `runSclTestCases`

Declarative test runner for XML-query assertions. Define test cases as objects pairing an input XML + expected DOM queries. Handles dialecte instantiation, act execution, and XML serialisation automatically.

```ts
runSclTestCases<GenericTestCase extends SclTest.BaseTestCase>(params: {
  testCases: SclTest.TestCases<GenericTestCase>
  act: (params: SclTest.ActParams<GenericTestCase>) => Promise<SclTest.ActResult>
}): void
```

Each test case object must have at least `{ description, xmlInput }`. Additional fields are accessible in the `act` callback under `tc`.

```ts
runSclTestCases({
	testCases: [
		{
			description: 'adds a VoltageLevel under Substation',
			xmlInput: `<SCL ${XMLNS_SCL_NAMESPACE}><Substation name="S1"/></SCL>`,
			expected: [`//scl:Substation[@name="S1"]/scl:VoltageLevel[@name="VL1"]`],
		},
	],
	async act({ query, transaction, tc }) {
		const substation = await query.getRecord({ tagName: 'Substation' })

		await transaction(async (tx) => {
			await tx.addChild(substation!, {
				tagName: 'VoltageLevel',
				attributes: { name: 'VL1' },
			})
		})

		return query
	},
})
```

See [Testing](https://dialecte.github.io/core/guide/development/testing) in the core docs for the full table-driven test format.

## XML assertions

`assertExpectedElementQueries` and `assertUnexpectedElementQueries` run XPath assertions against an exported XML string. Both use the SCL namespace map automatically.

### `assertExpectedElementQueries`

Fails if any of the provided XPath expressions does not match.

```ts
assertExpectedElementQueries(xmlString: string, xpaths: string[]): void
```

### `assertUnexpectedElementQueries`

Fails if any of the provided XPath expressions matches (negative assertion).

```ts
assertUnexpectedElementQueries(xmlString: string, xpaths: string[]): void
```

## Namespace constants

| Constant                    | Value                                                            |
| --------------------------- | ---------------------------------------------------------------- |
| `XMLNS_SCL_NAMESPACE`       | `xmlns="http://www.iec.ch/61850/2003/SCL"`                       |
| `XMLNS_SCL_6_100_NAMESPACE` | `xmlns:eIEC61850-6-100="http://www.iec.ch/61850/2019/SCL/6-100"` |
| `ALL_XMLNS_NAMESPACES`      | Both SCL namespaces + internal dev namespace combined            |

Use these as inline XML attribute strings when writing multi-line XML fixtures:

```ts
const xml = `<SCL ${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE}>...</SCL>`
```

## Type namespace

The `SclTest` namespace mirrors `CoreTest` bound to the SCL config:

| Type                   | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `SclTest.TestCases<T>` | Array of test case objects extending `BaseTestCase`                |
| `SclTest.ActParams<T>` | Params passed to the `act` callback (`query`, `transaction`, `tc`) |
| `SclTest.ActResult`    | Return value from `act` — a `Scl.Query` or XML string              |
| `SclTest.BaseTestCase` | Minimum shape: `{ description, xmlInput }`                         |

```ts
import type { SclTest } from '@dialecte/scl/test'
```
