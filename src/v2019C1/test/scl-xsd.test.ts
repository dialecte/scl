/// <reference types="vite/client" />
import { runSclTestCases } from './hydrated-test'
import { collectSclXsdViolations, configureSclXsdSchemas } from './scl-xsd'

import { afterAll, describe, expect } from 'vitest'

import type { SclTest } from './hydrated-test.types'

const SCHEMA_LOADERS = import.meta.glob<string>('./fixtures/xsd/*.xsd', {
	query: '?raw',
	import: 'default',
})

async function loadSchemas(params: { leaveOut?: string }): Promise<Record<string, string>> {
	const { leaveOut } = params
	const texts: Record<string, string> = {}
	for (const [path, load] of Object.entries(SCHEMA_LOADERS)) {
		const name = path.slice(path.lastIndexOf('/') + 1)
		if (name !== leaveOut) texts[name] = await load()
	}
	return texts
}

const VALID_XML = /* xml */ `
	<SCL xmlns="http://www.iec.ch/61850/2003/SCL" version="2007" revision="C" release="5">
		<Header id="h" uuid="0f9a2c55-7c39-4f4e-9d6a-2a7b8c1d0e01"/>
	</SCL>
`

// runs when the schema files are synced into the fixtures (npm run xsd:sync)
describe.skipIf(Object.keys(SCHEMA_LOADERS).length === 0)('configureSclXsdSchemas', () => {
	type TestCase = SclTest.BaseTestCase & {
		leaveOut?: string
		/** The error of the first check; `undefined` when it validates. */
		expectedError: string | undefined
	}

	const testCases: Record<string, TestCase> = {
		'a loader giving every schema file → the document validates': {
			expectedError: undefined,
		},
		'a loader missing a schema file → the first check says which': {
			leaveOut: 'SCL_Enums.xsd',
			expectedError: 'SCL schema files missing: SCL_Enums.xsd',
		},
	}

	async function act(testCase: TestCase) {
		configureSclXsdSchemas({ load: () => loadSchemas({ leaveOut: testCase.leaveOut }) })
		const outcome = collectSclXsdViolations({ xml: VALID_XML })
		if (testCase.expectedError === undefined)
			await expect(outcome).resolves.toEqual({ ran: true, violations: [] })
		else await expect(outcome).rejects.toThrow(testCase.expectedError)
	}

	afterAll(function restoreFixtureSchemas() {
		configureSclXsdSchemas({ load: () => loadSchemas({}) })
	})

	runSclTestCases.generic(testCases, act)
})

// runs when the schema files are synced into the fixtures (npm run xsd:sync)
describe.skipIf(Object.keys(SCHEMA_LOADERS).length === 0)('collectSclXsdViolations', () => {
	type TestCase = SclTest.BaseTestCase & {
		xml: string
		/** Whether the document is read as a hand-made test document (the Header it lacks supplied). */
		asTestDocument: boolean
		/** How many findings the validator gives, and how many of them name the Header. */
		expectedFindings: { all: number; namingTheHeader: number }
	}

	const ROOT_ATTRIBUTES =
		'xmlns="http://www.iec.ch/61850/2003/SCL" version="2007" revision="C" release="5"'
	const EMPTY_ROOT = /* xml */ `<SCL ${ROOT_ATTRIBUTES}/>`
	const ROOT_WITH_PRIVATE = /* xml */ `<SCL ${ROOT_ATTRIBUTES}><Private type="tool"/></SCL>`
	const TEST_DOCUMENT_HEADER = { id: 'test', uuid: '0f9a2c55-7c39-4f4e-9d6a-2a7b8c1d0e02' }

	const testCases: Record<string, TestCase> = {
		'an empty root read as a test document → the Header supplied last, no Header finding': {
			xml: EMPTY_ROOT,
			asTestDocument: true,
			expectedFindings: { all: 0, namingTheHeader: 0 },
		},
		'a root holding only a Private read as a test document → the Header supplied after it, no Header finding':
			{
				xml: ROOT_WITH_PRIVATE,
				asTestDocument: true,
				expectedFindings: { all: 0, namingTheHeader: 0 },
			},
		'an empty root not read as a test document → one Header finding': {
			xml: EMPTY_ROOT,
			asTestDocument: false,
			expectedFindings: { all: 1, namingTheHeader: 1 },
		},
		'a root holding only a Private not read as a test document → one Header finding': {
			xml: ROOT_WITH_PRIVATE,
			asTestDocument: false,
			expectedFindings: { all: 1, namingTheHeader: 1 },
		},
	}

	async function act(testCase: TestCase) {
		const report = await collectSclXsdViolations({
			xml: testCase.xml,
			missingHeader: testCase.asTestDocument ? TEST_DOCUMENT_HEADER : undefined,
		})
		const violations = report.ran ? report.violations : []
		expect({
			ran: report.ran,
			all: violations.length,
			namingTheHeader: violations.filter(function namesTheHeader(violation) {
				return violation.message.includes('Header')
			}).length,
		}).toEqual({ ran: true, ...testCase.expectedFindings })
	}

	runSclTestCases.generic(testCases, act)
})
