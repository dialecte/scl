import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from './hydrated-test'
import {
	assertOutputGateTestCases,
	closeGatedTestProject,
	readOutputBaseline,
	withOutputGate,
} from './output-gate'
import { isSclXsdConfigured } from './scl-xsd'

import { createTestProject, XmlAssertionError } from '@dialecte/core/test'
import { describe, expect } from 'vitest'

import { SCL_DIALECTE } from '@/v2019C1/declaration.constants'

import type { SclOutputOptOut } from './assert-scl-output.types'
import type { SclTest } from './hydrated-test.types'
import type { OutputGateTestCase } from './output-gate.types'

const FUNCTION_UUID = '5b1f6c2e-3a4d-4e8f-9a0b-1c2d3e4f5a01'
const LNODE_UUID = '5b1f6c2e-3a4d-4e8f-9a0b-1c2d3e4f5a02'
const OTHER_LNODE_UUID = '5b1f6c2e-3a4d-4e8f-9a0b-1c2d3e4f5a03'
const ROLE_UUID = '5b1f6c2e-3a4d-4e8f-9a0b-1c2d3e4f5a04'
const MISSING_UUID = '5b1f6c2e-3a4d-4e8f-9a0b-1c2d3e4f5a99'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

const SOURCE_XML = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES}>
		<Header id="output-gate"/>
		<Substation name="S1">
			<Private type="eIEC61850-6-100">
				<eIEC61850-6-100:AllocationRole name="Operator" uuid="${ROLE_UUID}" ${id}="role">
					<eIEC61850-6-100:FunctionRef functionUuid="${FUNCTION_UUID}" ${id}="function-ref"/>
				</eIEC61850-6-100:AllocationRole>
			</Private>
			<VoltageLevel name="V1">
				<Bay name="B1">
					<Function name="F1" uuid="${FUNCTION_UUID}">
						<LNode iedName="None" ldInst="LD1" lnClass="CSWI" lnInst="1" uuid="${LNODE_UUID}"/>
						<LNode iedName="None" ldInst="LD1" lnClass="CSWI" lnInst="2" uuid="${OTHER_LNODE_UUID}" ${id}="other-lnode"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

async function addFunctionRefNamingNothing(document: SclTest.TestDocument['document']) {
	await document.transaction(async (tx) => {
		await tx.addChild(
			{ tagName: 'AllocationRole', id: 'role' },
			{ tagName: 'FunctionRef', attributes: { functionUuid: MISSING_UUID } },
		)
	})
}

async function giveSecondLNodeTheFirstUuid(document: SclTest.TestDocument['document']) {
	await document.transaction(async (tx) => {
		await tx.update({ tagName: 'LNode', id: 'other-lnode' }, { attributes: { uuid: LNODE_UUID } })
	})
}

/**
 * The message of a gated case that left invalid documents: the header (saying when the XSD validator did not run), the
 * validator's lines when it ran, then the other lines. `undefined` when no line is left: the case resolves.
 */
function invalidDocumentMessage(params: {
	label: string
	lines: string[]
	xsdLines?: string[]
}): string | undefined {
	const { label, lines, xsdLines = [] } = params
	const xsd = isSclXsdConfigured()
	const reported = [...(xsd ? xsdLines : []), ...lines]
	if (reported.length === 0) return undefined
	const header = `${label}: the document left is not a valid SCL file${xsd ? '' : ' (checked without the XSD validator)'}:`
	return [header, ...reported.map((line) => `  ${line}`)].join('\n')
}

type ErrorKind = 'assertion' | 'plain'

function captureThrown(run: () => void): unknown {
	try {
		run()
	} catch (error) {
		return error
	}
	return undefined
}

/** An assertion miss is an `XmlAssertionError` named 'AssertionError'; a test defect is a plain `Error`. */
function expectErrorOfKind(params: { error: unknown; kind: ErrorKind }): void {
	const { error, kind } = params
	if (kind === 'assertion') {
		expect(error).toBeInstanceOf(XmlAssertionError)
		expect(error).toMatchObject({ name: 'AssertionError' })
		return
	}
	expect(error).toBeInstanceOf(Error)
	expect(error).not.toBeInstanceOf(XmlAssertionError)
	expect(error).toMatchObject({ name: 'Error' })
}

async function expectRejection(params: {
	outcome: Promise<unknown>
	kind: ErrorKind
	message: string
}): Promise<void> {
	const { outcome, kind, message } = params
	const error = await outcome.then(
		() => undefined,
		(rejected: unknown) => rejected,
	)
	expect(error).toBeDefined()
	expect(error).toMatchObject({ message: expect.stringContaining(message) })
	expectErrorOfKind({ error, kind })
}

async function openProject() {
	return createTestProject({ dialecte: SCL_DIALECTE, sourceXml: SOURCE_XML })
}

describe('withOutputGate', () => {
	type TestCase = SclTest.BaseTestCase & {
		gatedCase: OutputGateTestCase
		write: (document: SclTest.TestDocument['document']) => Promise<void>
		/** What the gated act rejects with; `undefined` when it resolves. */
		expectedMessage: string | undefined
		/** The kind of that rejection: an assertion miss, or a test defect (plain `Error`). */
		expectedError: ErrorKind | undefined
	}

	const testCases: Record<string, TestCase> = {
		'an act that leaves a dangling reference → rejects, naming the case and the document': {
			gatedCase: { sourceXml: SOURCE_XML },
			write: addFunctionRefNamingNothing,
			expectedMessage: invalidDocumentMessage({
				label: 'gated case › source',
				lines: [
					`[references] [dangling] <FunctionRef> functionUuid="${MISSING_UUID}" points at no element of the document`,
				],
			}),
			expectedError: 'assertion',
		},
		'the same act in a case that tolerates a dangling reference → resolves': {
			gatedCase: {
				sourceXml: SOURCE_XML,
				allowInvalidOutput: {
					reason: 'the reference is repaired by the clean-up under test',
					violations: [{ check: 'references', code: 'dangling' }],
				},
			},
			write: addFunctionRefNamingNothing,
			expectedMessage: undefined,
			expectedError: undefined,
		},
		'an act that leaves a valid document under an opt-out that tolerates a dangling reference → rejects as a plain error, naming the stale opt-out':
			{
				gatedCase: {
					sourceXml: SOURCE_XML,
					allowInvalidOutput: {
						reason: 'the reference is repaired by the clean-up under test',
						violations: [{ check: 'references', code: 'dangling' }],
					},
				},
				async write() {},
				expectedMessage: invalidDocumentMessage({
					label: 'gated case',
					lines: [
						'[opt-out] allows references dangling, which the case no longer leaves: remove it',
					],
				}),
				expectedError: 'plain',
			},
		'an act that throws → its own error, never the gate': {
			gatedCase: { sourceXml: SOURCE_XML },
			async write(document) {
				await addFunctionRefNamingNothing(document)
				throw new Error('the act failed')
			},
			expectedMessage: 'the act failed',
			expectedError: 'plain',
		},
	}

	async function act(testCase: TestCase) {
		const { project, source } = await openProject()
		try {
			const gatedAct = withOutputGate({
				act: async ({ source: document }: SclTest.ActParams<OutputGateTestCase>) =>
					testCase.write(document),
				testCases: { 'gated case': testCase.gatedCase },
			})
			const outcome = gatedAct({ testCase: testCase.gatedCase, project, source: source.document })
			if (testCase.expectedMessage === undefined || testCase.expectedError === undefined) {
				await expect(outcome).resolves.toBeUndefined()
			} else {
				await expectRejection({
					outcome,
					kind: testCase.expectedError,
					message: testCase.expectedMessage,
				})
			}
		} finally {
			await project.destroy()
		}
	}

	runSclTestCases.generic(testCases, act)
})

describe('closeGatedTestProject', () => {
	type TestCase = SclTest.BaseTestCase & {
		write: (document: SclTest.TestDocument['document']) => Promise<void>
		testFailed: boolean
		allowInvalidOutput?: SclOutputOptOut
		expectedMessage: string | undefined
		/** The kind of that rejection: an assertion miss, or a test defect (plain `Error`). */
		expectedError: ErrorKind | undefined
	}

	const duplicateUuidMessage = invalidDocumentMessage({
		label: 'a test › source',
		xsdLines: [
			`[xsd] Element '{http://www.iec.ch/61850/2003/SCL}LNode': Duplicate key-sequence ['${LNODE_UUID}'] in unique identity-constraint '{http://www.iec.ch/61850/2003/SCL}uniqueUUID'.`,
		],
		lines: [
			`[identity] duplicate-instance-uuid: uuid "${LNODE_UUID}" is used by 2 elements (LNode); every instance UUID in an SCL shall be unique.`,
		],
	})

	const testCases: Record<string, TestCase> = {
		'a test that leaves a duplicate uuid → the finished hook rejects with it': {
			write: giveSecondLNodeTheFirstUuid,
			testFailed: false,
			expectedMessage: duplicateUuidMessage,
			expectedError: 'assertion',
		},
		'a test that failed already → no check, its own failure is the one to read': {
			write: giveSecondLNodeTheFirstUuid,
			testFailed: true,
			expectedMessage: undefined,
			expectedError: undefined,
		},
		'a test that tolerates the duplicate it leaves → resolves': {
			write: giveSecondLNodeTheFirstUuid,
			testFailed: false,
			allowInvalidOutput: {
				reason: 'the duplicate is what the identity check under test reports',
				violations: [
					{ check: 'identity', code: 'duplicate-instance-uuid' },
					{ check: 'xsd', code: 'duplicate-key' },
				],
			},
			expectedMessage: undefined,
			expectedError: undefined,
		},
		'a test that tolerates another violation than the one it leaves → rejects, with the stale opt-out':
			{
				write: giveSecondLNodeTheFirstUuid,
				testFailed: false,
				allowInvalidOutput: {
					reason: 'a dangling reference the clean-up removes',
					violations: [{ check: 'references', code: 'dangling' }],
				},
				expectedMessage: [
					duplicateUuidMessage,
					invalidDocumentMessage({
						label: 'a test',
						lines: [
							'[opt-out] allows references dangling, which the case no longer leaves: remove it',
						],
					}),
				].join('\n'),
				expectedError: 'assertion',
			},
		'a test that leaves a valid document under an opt-out that tolerates a dangling reference → rejects as a plain error, with the stale opt-out alone':
			{
				async write() {},
				testFailed: false,
				allowInvalidOutput: {
					reason: 'a dangling reference the clean-up removes',
					violations: [{ check: 'references', code: 'dangling' }],
				},
				expectedMessage: invalidDocumentMessage({
					label: 'a test',
					lines: [
						'[opt-out] allows references dangling, which the case no longer leaves: remove it',
					],
				}),
				expectedError: 'plain',
			},
		'a test that leaves a valid document → resolves': {
			async write() {},
			testFailed: false,
			expectedMessage: undefined,
			expectedError: undefined,
		},
	}

	async function act(testCase: TestCase) {
		const { project, source } = await openProject()
		const baseline = await readOutputBaseline({
			project,
			documents: [{ role: 'source', document: source.document }],
		})
		await testCase.write(source.document)

		const outcome = closeGatedTestProject({
			project,
			baseline,
			label: 'a test',
			allowInvalidOutput: testCase.allowInvalidOutput,
			testFailed: testCase.testFailed,
		})
		if (testCase.expectedMessage === undefined || testCase.expectedError === undefined) {
			await expect(outcome).resolves.toBeUndefined()
		} else {
			await expectRejection({
				outcome,
				kind: testCase.expectedError,
				message: testCase.expectedMessage,
			})
		}
		// destroyed whatever the check found
		await expect(project.getDocuments()).rejects.toThrow()
	}

	runSclTestCases.generic(testCases, act)
})

describe('assertOutputGateTestCases', () => {
	type TestCase = SclTest.BaseTestCase & {
		checkedCases: Record<string, OutputGateTestCase>
		expectedMessage: string | undefined
		/** The refusal is a declaration defect: a plain `Error`; `undefined` when accepted. */
		expectedError: 'plain' | undefined
	}

	const testCases: Record<string, TestCase> = {
		'an opt-out with an empty reason → refused before the suite runs, naming the case': {
			checkedCases: {
				'kept case': {
					sourceXml: SOURCE_XML,
					allowInvalidOutput: {
						reason: 'an orphan to clean up',
						violations: [{ check: 'references', code: 'dangling' }],
					},
				},
				'silent case': {
					sourceXml: SOURCE_XML,
					allowInvalidOutput: { reason: '', violations: [{ check: 'references' }] },
				},
			},
			expectedMessage:
				'silent case: allowInvalidOutput needs the reason the case leaves an invalid document, not an empty string',
			expectedError: 'plain',
		},
		'cases without an opt-out → accepted': {
			checkedCases: { 'plain case': { sourceXml: SOURCE_XML } },
			expectedMessage: undefined,
			expectedError: undefined,
		},
	}

	function act(testCase: TestCase) {
		function check() {
			assertOutputGateTestCases({ testCases: testCase.checkedCases })
		}
		if (testCase.expectedMessage === undefined || testCase.expectedError === undefined) {
			expect(check).not.toThrow()
			return
		}
		expect(check).toThrow(testCase.expectedMessage)
		expectErrorOfKind({ error: captureThrown(check), kind: testCase.expectedError })
	}

	runSclTestCases.generic(testCases, act)
})

describe('runSclTestCases', () => {
	type TestCase = SclTest.BaseTestCase & { register: () => void; expectedMessage: string }

	const silentCases = {
		'silent case': {
			sourceXml: SOURCE_XML,
			allowInvalidOutput: { reason: '', violations: [{ check: 'references' as const }] },
		},
	}
	const expectedMessage =
		'silent case: allowInvalidOutput needs the reason the case leaves an invalid document, not an empty string'

	const invalidCases = {
		'invalid case': {
			sourceXml: /* xml */ `<SCL ${ALL_XMLNS_NAMESPACES}><Substation notAnAttribute="S1"/></SCL>`,
		},
	}
	const expectedInvalidMessage = 'invalid case › sourceXml: not valid SCL'

	const testCases: Record<string, TestCase> = {
		'withExport, a case whose opt-out gives no reason → refused when registered': {
			register: () => runSclTestCases.withExport({ testCases: silentCases, act: async () => {} }),
			expectedMessage,
		},
		'withoutExport, a case whose opt-out gives no reason → refused when registered': {
			register: () =>
				runSclTestCases.withoutExport({ testCases: silentCases, act: async () => {} }),
			expectedMessage,
		},
		'withExport, a case the SCL schema refuses → refused when registered': {
			register: () => runSclTestCases.withExport({ testCases: invalidCases, act: async () => {} }),
			expectedMessage: expectedInvalidMessage,
		},
		'withoutExport, a case the SCL schema refuses → refused when registered': {
			register: () =>
				runSclTestCases.withoutExport({ testCases: invalidCases, act: async () => {} }),
			expectedMessage: expectedInvalidMessage,
		},
	}

	function act(testCase: TestCase) {
		expect(testCase.register).toThrow(testCase.expectedMessage)
	}

	runSclTestCases.generic(testCases, act)
})

describe('withOutputGate — the documents of the project', () => {
	const DANGLING_UUID = '5b1f6c2e-3a4d-4e8f-9a0b-1c2d3e4f5a98'
	const sourceXml = /* xml */ `
		<SCL ${ALL_XMLNS_NAMESPACES}>
			<Header id="source" uuid="5b1f6c2e-3a4d-4e8f-9a0b-1c2d3e4f5a10"/>
			<Substation name="TEMPLATE" ${id}="source-substation">
				<Private type="eIEC61850-6-100">
					<eIEC61850-6-100:AllocationRole name="Operator" uuid="5b1f6c2e-3a4d-4e8f-9a0b-1c2d3e4f5a11">
						<eIEC61850-6-100:FunctionRef functionUuid="${DANGLING_UUID}"/>
					</eIEC61850-6-100:AllocationRole>
				</Private>
				<VoltageLevel name="TEMPLATE">
					<Bay name="TEMPLATE">
						<Function name="Typical" uuid="CB_APP"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
	const targetXml = /* xml */ `
		<SCL ${ALL_XMLNS_NAMESPACES}>
			<Header id="target" uuid="5b1f6c2e-3a4d-4e8f-9a0b-1c2d3e4f5a20"/>
			<Substation name="S1" ${id}="target-substation">
				<VoltageLevel name="V1">
					<Bay name="B1" ${id}="target-bay"/>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
	// a third document, imported during the act: a template the act reads from
	const importedXml = /* xml */ `
		<SCL ${ALL_XMLNS_NAMESPACES}>
			<Header id="imported" uuid="5b1f6c2e-3a4d-4e8f-9a0b-1c2d3e4f5a30"/>
			<Substation name="TEMPLATE">
				<Private type="eIEC61850-6-100">
					<eIEC61850-6-100:AllocationRole name="Reader" uuid="5b1f6c2e-3a4d-4e8f-9a0b-1c2d3e4f5a31">
						<eIEC61850-6-100:FunctionRef functionUuid="${MISSING_UUID}"/>
					</eIEC61850-6-100:AllocationRole>
				</Private>
				<VoltageLevel name="TEMPLATE">
					<Bay name="TEMPLATE"/>
				</VoltageLevel>
			</Substation>
		</SCL>
	`

	type Gated = SclTest.ActParams<OutputGateTestCase>

	/** What a copy of the source's role gives the target: a role naming the function the source does not hold. */
	async function addDanglingRole(params: {
		document: SclTest.TestDocument['document']
		substationId: string
		functionUuid: string
	}): Promise<void> {
		const { document, substationId, functionUuid } = params
		await document.transaction(async (tx) => {
			const role = await tx.addChild(
				{ tagName: 'Substation', id: substationId },
				{ tagName: 'AllocationRole', attributes: { name: `Role-${crypto.randomUUID()}` } },
			)
			await tx.addChild(role, { tagName: 'FunctionRef', attributes: { functionUuid } })
		})
	}

	async function addFunction(params: {
		document: SclTest.TestDocument['document']
		uuid: string
	}): Promise<void> {
		const { document, uuid } = params
		await document.transaction(async (tx) => {
			await tx.addChild(
				{ tagName: 'Bay', id: 'target-bay' },
				{ tagName: 'Function', attributes: { name: `F-${uuid}`, uuid } },
			)
		})
	}

	type TestCase = SclTest.BaseTestCase & {
		act: (params: Gated) => Promise<void>
		/** What the gate rejects with; `undefined` when it resolves. */
		expectedMessage: string | undefined
	}

	const gainedInBoth =
		'[references] [dangling] <FunctionRef> functionUuid="5b1f6c2e-3a4d-4e8f-9a0b-1c2d3e4f5a97" points at no element of the document'
	const danglingInTarget = `[references] [dangling] <FunctionRef> functionUuid="${DANGLING_UUID}" points at no element of the document`

	const testCases: Record<string, TestCase> = {
		'a violation the source holds, copied once into the target → carried': {
			async act({ target }) {
				if (!target) throw new Error('target required')
				await addDanglingRole({
					document: target,
					substationId: 'target-substation',
					functionUuid: DANGLING_UUID,
				})
			},
			expectedMessage: undefined,
		},
		'a violation the source holds once, copied twice into the target → the second copy reported': {
			async act({ target }) {
				if (!target) throw new Error('target required')
				const params = {
					document: target,
					substationId: 'target-substation',
					functionUuid: DANGLING_UUID,
				}
				await addDanglingRole(params)
				await addDanglingRole(params)
			},
			expectedMessage: invalidDocumentMessage({
				label: 'gated case › target',
				lines: [danglingInTarget],
			}),
		},
		'the same violation gained by the source and the target → reported in both': {
			async act({ source, target }) {
				if (!target) throw new Error('target required')
				const functionUuid = '5b1f6c2e-3a4d-4e8f-9a0b-1c2d3e4f5a97'
				await addDanglingRole({ document: source, substationId: 'source-substation', functionUuid })
				await addDanglingRole({ document: target, substationId: 'target-substation', functionUuid })
			},
			expectedMessage: [
				invalidDocumentMessage({ label: 'gated case › source', lines: [gainedInBoth] }),
				invalidDocumentMessage({ label: 'gated case › target', lines: [gainedInBoth] }),
			].join('\n'),
		},
		'a violation a document imported during the act holds, copied into the target → carried': {
			async act({ project, target }) {
				if (!target) throw new Error('target required')
				await project.import([new File([importedXml], 'imported.xml', { type: 'text/xml' })])
				await addDanglingRole({
					document: target,
					substationId: 'target-substation',
					functionUuid: MISSING_UUID,
				})
			},
			expectedMessage: undefined,
		},
		'a value the source writes as a uuid, copied into the target → read as a uuid': {
			async act({ target }) {
				if (!target) throw new Error('target required')
				await addFunction({ document: target, uuid: 'CB_APP' })
			},
			expectedMessage: undefined,
		},
		'a value no document writes as a uuid, written by the act → reported': {
			async act({ target }) {
				if (!target) throw new Error('target required')
				await addFunction({ document: target, uuid: 'Protection/F1' })
			},
			// the validator's verdict: without it, nothing the other checks see
			expectedMessage: invalidDocumentMessage({
				label: 'gated case › target',
				xsdLines: [
					"[xsd] Element '{http://www.iec.ch/61850/2003/SCL}Function', attribute 'uuid': [facet 'pattern'] The value 'Protection/F1' is not accepted by the pattern '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'.",
				],
				lines: [],
			}),
		},
	}

	async function act(testCase: TestCase) {
		const { project, source, target } = await createTestProject({
			dialecte: SCL_DIALECTE,
			sourceXml,
			targetXml,
		})
		try {
			const gatedCase: OutputGateTestCase = {
				sourceXml,
				targetXml,
				allowIncoherentReferences:
					'the source holds a function reference naming no function on purpose: the tests read what the gate does with a violation a document already holds',
			}
			const gatedAct = withOutputGate({
				act: testCase.act,
				testCases: { 'gated case': gatedCase },
			})
			const outcome = gatedAct({
				testCase: gatedCase,
				project,
				source: source.document,
				target: target?.document,
			})
			if (testCase.expectedMessage === undefined) await expect(outcome).resolves.toBeUndefined()
			else {
				// every rejection here is a violation the act added
				await expectRejection({ outcome, kind: 'assertion', message: testCase.expectedMessage })
			}
		} finally {
			await project.destroy()
		}
	}

	runSclTestCases.generic(testCases, act)
})

describe('withOutputGate — the given documents', () => {
	const DUPLICATE_BAY_XML = /* xml */ `
		<SCL ${ALL_XMLNS_NAMESPACES}>
			<Header id="given-documents"/>
			<Substation name="S1">
				<VoltageLevel name="V1" ${id}="v1">
					<Bay name="B1" ${id}="bay-1"/>
					<Bay name="B1" ${id}="bay-2"/>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
	const DUPLICATE_UUID_XML = /* xml */ `
		<SCL ${ALL_XMLNS_NAMESPACES}>
			<Header id="given-documents"/>
			<Substation name="S1">
				<VoltageLevel name="V1">
					<Bay name="B1">
						<Function name="F1" uuid="${FUNCTION_UUID}">
							<LNode iedName="None" ldInst="LD1" lnClass="CSWI" lnInst="1" uuid="${LNODE_UUID}"/>
							<LNode iedName="None" ldInst="LD1" lnClass="CSWI" lnInst="2" uuid="${LNODE_UUID}"/>
						</Function>
					</Bay>
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
	const DANGLING_XML = /* xml */ `
		<SCL ${ALL_XMLNS_NAMESPACES}>
			<Header id="given-documents"/>
			<Substation name="S1">
				<Private type="eIEC61850-6-100">
					<eIEC61850-6-100:AllocationRole name="Operator" uuid="${ROLE_UUID}">
						<eIEC61850-6-100:FunctionRef functionUuid="${MISSING_UUID}"/>
					</eIEC61850-6-100:AllocationRole>
				</Private>
			</Substation>
		</SCL>
	`

	const reason = 'the case needs a given document a real file could not be'

	function fixtureHeader(role: 'source' | 'target'): string {
		return `gated case › ${role}: the ${role} document has 1 violation(s) before the act: a given document must pass the output checks (give allowInvalidFixture with the violations and why):`
	}
	const duplicateBayDescription =
		'[uniqueness] <Bay> name="B1" repeats an earlier sibling under SCL/Substation[S1]/VoltageLevel[V1] (uniqueChildNameInVoltageLevel)'
	const duplicateBayLine = `  ${duplicateBayDescription}`
	const duplicateUuidLine = `  [identity] duplicate-instance-uuid: uuid "${LNODE_UUID}" is used by 2 elements (LNode); every instance UUID in an SCL shall be unique.`
	const uniquenessOptOut: SclOutputOptOut = { reason, violations: [{ check: 'uniqueness' }] }
	const danglingLine = `  [references] [dangling] <FunctionRef> functionUuid="${MISSING_UUID}" points at no element of the document`

	type TestCase = SclTest.BaseTestCase & {
		gatedCase: OutputGateTestCase
		/** What the gated act rejects with, a plain `Error` before the act; `undefined` when it resolves. */
		expectedMessage: string | undefined
		expectedActRan: boolean
		/** What the act does to the source (default: nothing). */
		write?: (document: SclTest.TestDocument['document']) => Promise<void>
		/** The kind of rejection (default: a plain `Error`). */
		expectedError?: ErrorKind
	}

	const testCases: Record<string, TestCase> = {
		'a source with two siblings of one key, no opt-out → rejects before the act, naming the source':
			{
				gatedCase: { sourceXml: DUPLICATE_BAY_XML },
				expectedMessage: `${fixtureHeader('source')}\n${duplicateBayLine}`,
				expectedActRan: false,
			},
		'a source missing a required attribute → resolves (partial fixtures)': {
			gatedCase: { sourceXml: PARTIAL_XML },
			expectedMessage: undefined,
			expectedActRan: true,
		},
		'a source holding a duplicate key under an opt-out listing it with a reason → resolves': {
			gatedCase: {
				sourceXml: DUPLICATE_BAY_XML,
				allowInvalidFixture: { reason, violations: [{ check: 'uniqueness' }] },
			},
			expectedMessage: undefined,
			expectedActRan: true,
		},
		'a valid source under an opt-out listing a duplicate key → rejects before the act, naming the stale opt-out':
			{
				gatedCase: {
					sourceXml: SOURCE_XML,
					allowInvalidFixture: uniquenessOptOut,
				},
				expectedMessage:
					'gated case: [opt-out] allowInvalidFixture allows uniqueness, which the given documents do not hold: remove it',
				expectedActRan: false,
			},
		'a source with a dangling reference, allowIncoherentReferences set → resolves': {
			gatedCase: {
				sourceXml: DANGLING_XML,
				allowIncoherentReferences: 'the reference is repaired by the act under test',
			},
			expectedMessage: undefined,
			expectedActRan: true,
		},
		'a source with a dangling reference, no opt-out → rejects before the act, naming the references violation':
			{
				gatedCase: { sourceXml: DANGLING_XML },
				expectedMessage: `${fixtureHeader('source')}\n${danglingLine}`,
				expectedActRan: false,
			},
		'a target with two siblings of one key → rejects before the act, naming the target': {
			gatedCase: { sourceXml: SOURCE_XML, targetXml: DUPLICATE_BAY_XML },
			expectedMessage: `${fixtureHeader('target')}\n${duplicateBayLine}`,
			expectedActRan: false,
		},
		'a source holding a duplicate key under an opt-out, the act adds another duplicate → the output gate rejects (the fixture opt-out does not leak)':
			{
				gatedCase: { sourceXml: DUPLICATE_BAY_XML, allowInvalidFixture: uniquenessOptOut },
				async write(document) {
					await document.transaction(async (tx) => {
						await tx.addChild(
							{ tagName: 'VoltageLevel', id: 'v1' },
							{ tagName: 'Bay', attributes: { name: 'B1' } },
						)
					})
				},
				expectedMessage: invalidDocumentMessage({
					label: 'gated case › source',
					xsdLines: [
						`[xsd] Element '{http://www.iec.ch/61850/2003/SCL}Bay': Duplicate key-sequence ['B1'] in unique identity-constraint '{http://www.iec.ch/61850/2003/SCL}uniqueChildNameInVoltageLevel'.`,
					],
					lines: [duplicateBayDescription],
				}),
				expectedError: 'assertion',
				expectedActRan: true,
			},
		'a source holding a duplicate key under an opt-out, the act deletes the second Bay → resolves (staleness is judged on the given documents)':
			{
				gatedCase: { sourceXml: DUPLICATE_BAY_XML, allowInvalidFixture: uniquenessOptOut },
				async write(document) {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'Bay', id: 'bay-2' })
					})
				},
				expectedMessage: undefined,
				expectedActRan: true,
			},
		'a source holding a duplicate key, only allowInvalidOutput listing it → rejects before the act (the output opt-out never covers a given document)':
			{
				gatedCase: { sourceXml: DUPLICATE_BAY_XML, allowInvalidOutput: uniquenessOptOut },
				expectedMessage: `${fixtureHeader('source')}\n${duplicateBayLine}`,
				expectedActRan: false,
			},
		'a source with two elements of one uuid → rejects before the act, naming the identity violation':
			{
				gatedCase: { sourceXml: DUPLICATE_UUID_XML },
				expectedMessage: `${fixtureHeader('source')}\n${duplicateUuidLine}`,
				expectedActRan: false,
			},
		'a source and a target with two siblings of one key → rejects before the act, both documents in order':
			{
				gatedCase: { sourceXml: DUPLICATE_BAY_XML, targetXml: DUPLICATE_BAY_XML },
				expectedMessage: `${fixtureHeader('source')}\n${duplicateBayLine}\n${fixtureHeader('target')}\n${duplicateBayLine}`,
				expectedActRan: false,
			},
	}

	async function act(testCase: TestCase) {
		const { sourceXml, targetXml } = testCase.gatedCase
		const { project, source, target } = await createTestProject({
			dialecte: SCL_DIALECTE,
			sourceXml,
			targetXml,
		})
		try {
			const ran = { act: false }
			const gatedAct = withOutputGate({
				async act({ source: document }: SclTest.ActParams<OutputGateTestCase>) {
					ran.act = true
					await testCase.write?.(document)
				},
				testCases: { 'gated case': testCase.gatedCase },
			})
			const outcome = gatedAct({
				testCase: testCase.gatedCase,
				project,
				source: source.document,
				target: target?.document,
			})
			if (testCase.expectedMessage === undefined) {
				await expect(outcome).resolves.toBeUndefined()
			} else {
				await expectRejection({
					outcome,
					kind: testCase.expectedError ?? 'plain',
					message: testCase.expectedMessage,
				})
			}
			expect(ran.act).toBe(testCase.expectedActRan)
		} finally {
			await project.destroy()
		}
	}

	runSclTestCases.generic(testCases, act)
})

describe('assertOutputGateTestCases — allowInvalidFixture', () => {
	type TestCase = SclTest.BaseTestCase & {
		checkedCase: OutputGateTestCase
		expectedMessage: string
	}

	const testCases: Record<string, TestCase> = {
		'an opt-out with an empty reason → refused before the suite runs': {
			checkedCase: {
				sourceXml: SOURCE_XML,
				allowInvalidFixture: { reason: '', violations: [{ check: 'uniqueness' }] },
			},
			expectedMessage:
				"silent case: allowInvalidFixture needs the reason the case's given documents are invalid, not an empty string",
		},
		'an opt-out with an empty list → refused before the suite runs': {
			checkedCase: {
				sourceXml: SOURCE_XML,
				allowInvalidFixture: { reason: 'a duplicate key on purpose', violations: [] },
			},
			expectedMessage:
				'silent case: allowInvalidFixture needs the violations the given documents hold, not an empty list',
		},
		'an opt-out with an xsd tolerance → refused before the suite runs': {
			checkedCase: {
				sourceXml: SOURCE_XML,
				allowInvalidFixture: {
					reason: 'a duplicate key on purpose',
					violations: [{ check: 'xsd', code: 'missing-child' }],
				},
			},
			expectedMessage:
				'silent case: allowInvalidFixture lists xsd, a check given documents are not held to: remove it',
		},
		'an opt-out with a references tolerance → refused before the suite runs': {
			checkedCase: {
				sourceXml: SOURCE_XML,
				allowInvalidFixture: {
					reason: 'a dangling reference on purpose',
					violations: [{ check: 'references', code: 'dangling' }],
				},
			},
			expectedMessage:
				'silent case: allowInvalidFixture lists references, which allowIncoherentReferences covers: give that instead',
		},
	}

	function act(testCase: TestCase) {
		function check() {
			assertOutputGateTestCases({ testCases: { 'silent case': testCase.checkedCase } })
		}
		expect(check).toThrow(testCase.expectedMessage)
		expectErrorOfKind({ error: captureThrown(check), kind: 'plain' })
	}

	runSclTestCases.generic(testCases, act)
})
