import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ALL_XMLNS_NAMESPACES, createSclTestProject, runSclTestCases } from '@/v2019C1/test'

import type { SclOutputOptOut } from './assert-scl-output.types'
import type { SclTest } from './hydrated-test.types'

const sourceXml = /* xml */ `<SCL ${ALL_XMLNS_NAMESPACES} />`

/** A terminal carrying the uuid of a node the file does not hold: the reference check refuses it. */
const INCOHERENT_XML = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES}>
		<Substation name="S1">
			<VoltageLevel name="VL1">
				<Bay name="B1">
					<ConductingEquipment name="QA1" type="CBR">
						<Terminal connectivityNode="S1/VL1/B1/L1" cNodeName="L1" cNodeUuid="00000000-0000-4000-8000-000000000009"/>
					</ConductingEquipment>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A call made outside a running test (the test owns no project there): its error, the databases it opened. */
type OutsideCall = { error?: unknown; openedDatabases: string[] }

async function callOutsideRunningTest(params: { xml: string }): Promise<OutsideCall> {
	const called: OutsideCall = { openedDatabases: [] }
	const open = vi.spyOn(indexedDB, 'open')
	try {
		await createSclTestProject({ sourceXml: params.xml })
	} catch (error) {
		called.error = error
	}
	called.openedDatabases = open.mock.calls.map(([name]) => name)
	open.mockRestore()
	return called
}

/** The databases of the call still there. */
async function databasesLeftBy(params: { called: OutsideCall }): Promise<(string | undefined)[]> {
	const databases = await indexedDB.databases()
	return databases
		.map(({ name }) => name)
		.filter((name) => name !== undefined && params.called.openedDatabases.includes(name))
}

describe('createSclTestProject', () => {
	const outside: { coherent: OutsideCall; incoherent: OutsideCall } = {
		coherent: { openedDatabases: [] },
		incoherent: { openedDatabases: [] },
	}
	beforeAll(async function callOutsideRunningTests() {
		outside.coherent = await callOutsideRunningTest({ xml: sourceXml })
		outside.incoherent = await callOutsideRunningTest({ xml: INCOHERENT_XML })
	})

	it('called outside a running test, rejects and leaves no project open', async () => {
		expect(outside.coherent.error).toBeInstanceOf(Error)
		expect(outside.coherent.openedDatabases.length).toBeGreaterThan(0)
		await expect(databasesLeftBy({ called: outside.coherent })).resolves.toEqual([])
	})

	it('given an incoherent fixture outside a running test, rejects on it and leaves no project open', async () => {
		expect(String(outside.incoherent.error)).toContain('cNodeUuid')
		await expect(databasesLeftBy({ called: outside.incoherent })).resolves.toEqual([])
	})
})

describe('createSclTestProject — the given documents', () => {
	const VALID_XML = /* xml */ `
		<SCL ${ALL_XMLNS_NAMESPACES}>
			<Header id="given-documents"/>
			<Substation name="S1">
				<VoltageLevel name="V1">
					<Bay name="B1"/>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
	const DUPLICATE_BAY_XML = /* xml */ `
		<SCL ${ALL_XMLNS_NAMESPACES}>
			<Header id="given-documents"/>
			<Substation name="S1">
				<VoltageLevel name="V1">
					<Bay name="B1"/>
					<Bay name="B1"/>
				</VoltageLevel>
			</Substation>
		</SCL>
	`

	const PARTIAL_XML = /* xml */ `
		<SCL ${ALL_XMLNS_NAMESPACES}>
			<Header id="given-documents"/>
			<Substation name="S1">
				<VoltageLevel name="V1">
					<Bay/>
				</VoltageLevel>
			</Substation>
		</SCL>
	`

	const reason = 'the case needs a given document a real file could not be'
	const duplicateBayLine =
		'  [uniqueness] <Bay> name="B1" repeats an earlier sibling under SCL/Substation[S1]/VoltageLevel[V1] (uniqueChildNameInVoltageLevel)'

	/** The full name of the running test, suite names included, as vitest gives it: the label the check gives its messages. */
	function labelOfRunningTest(): string {
		return expect.getState().currentTestName ?? 'createSclTestProject'
	}

	function fixtureHeader(params: { label: string; role: 'source' | 'target' }): string {
		const { label, role } = params
		return `${label} › ${role}: the ${role} document has 1 violation(s) before the act: a given document must pass the output checks (give allowInvalidFixture with the violations and why):`
	}

	type TestCase = SclTest.BaseTestCase & {
		sourceXml: string
		targetXml?: string
		allowInvalidFixture?: SclOutputOptOut
		allowIncoherentReferences?: string
		/** What the call rejects with, given the running test's label; `undefined` when it opens. */
		expectedMessage: ((label: string) => string) | undefined
	}

	const testCases: Record<string, TestCase> = {
		'a source with two siblings of one key, no opt-out → the call rejects, naming the source': {
			sourceXml: DUPLICATE_BAY_XML,
			expectedMessage: (label) =>
				`${fixtureHeader({ label, role: 'source' })}\n${duplicateBayLine}`,
		},
		'a source with a duplicate key, opt-out listing it with a reason → opens': {
			sourceXml: DUPLICATE_BAY_XML,
			allowInvalidFixture: { reason, violations: [{ check: 'uniqueness' }] },
			expectedMessage: undefined,
		},
		'a valid source, opt-out listing a duplicate key → the call rejects, naming the stale opt-out':
			{
				sourceXml: VALID_XML,
				allowInvalidFixture: { reason, violations: [{ check: 'uniqueness' }] },
				expectedMessage: (label) =>
					`${label}: [opt-out] allowInvalidFixture allows uniqueness, which the given documents do not hold: remove it`,
			},
		'an opt-out with an empty reason → the call refuses it': {
			sourceXml: DUPLICATE_BAY_XML,
			allowInvalidFixture: { reason: '', violations: [{ check: 'uniqueness' }] },
			expectedMessage: (label) =>
				`${label}: allowInvalidFixture needs the reason the case's given documents are invalid, not an empty string`,
		},
		'an opt-out with an empty list → the call refuses it': {
			sourceXml: DUPLICATE_BAY_XML,
			allowInvalidFixture: { reason, violations: [] },
			expectedMessage: (label) =>
				`${label}: allowInvalidFixture needs the violations the given documents hold, not an empty list`,
		},
		'an opt-out with an xsd tolerance → the call refuses it': {
			sourceXml: DUPLICATE_BAY_XML,
			allowInvalidFixture: { reason, violations: [{ check: 'xsd', code: 'missing-child' }] },
			expectedMessage: (label) =>
				`${label}: allowInvalidFixture lists xsd, a check given documents are not held to: remove it`,
		},
		'an opt-out with a references tolerance → the call refuses it': {
			sourceXml: DUPLICATE_BAY_XML,
			allowInvalidFixture: { reason, violations: [{ check: 'references', code: 'dangling' }] },
			expectedMessage: (label) =>
				`${label}: allowInvalidFixture lists references, which allowIncoherentReferences covers: give that instead`,
		},
		'a source missing a required attribute → opens (partial fixtures)': {
			sourceXml: PARTIAL_XML,
			expectedMessage: undefined,
		},
		'a source with an incoherent reference, allowIncoherentReferences set → opens': {
			sourceXml: INCOHERENT_XML,
			allowIncoherentReferences: 'the reference is repaired by the test',
			expectedMessage: undefined,
		},
		'a target with two siblings of one key → the call rejects, naming the target': {
			sourceXml: VALID_XML,
			targetXml: DUPLICATE_BAY_XML,
			expectedMessage: (label) =>
				`${fixtureHeader({ label, role: 'target' })}\n${duplicateBayLine}`,
		},
	}

	async function act(testCase: TestCase) {
		const { sourceXml, targetXml, allowInvalidFixture, allowIncoherentReferences } = testCase
		const opened = createSclTestProject({
			sourceXml,
			targetXml,
			allowInvalidFixture,
			allowIncoherentReferences,
		})
		if (testCase.expectedMessage === undefined) {
			await expect(opened).resolves.toBeDefined()
			return
		}
		const error = await opened.then(
			() => undefined,
			(rejected: unknown) => rejected,
		)
		expect(error).toBeDefined()
		expect(error).toMatchObject({
			name: 'Error',
			message: expect.stringContaining(testCase.expectedMessage(labelOfRunningTest())),
		})
	}

	runSclTestCases.generic(testCases, act)
})
