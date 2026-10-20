import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from './hydrated-test'
import {
	assertOutputGateTestCases,
	closeGatedTestProject,
	readOutputBaseline,
	withOutputGate,
} from './output-gate'
import { SCL_TEST_SETUP } from './scl-test-setup.constants'
import { isSclXsdConfigured } from './scl-xsd'

import { createTestProject } from '@dialecte/core/test'
import { describe, expect } from 'vitest'

import type { SclOutputOptOut } from './assert-scl-output.types'
import type { SclTest } from './hydrated-test.types'
import type { OutputGateTestCase } from './output-gate.types'
import type { Config } from '@/v2019C1/config/dialecte.config'

const FUNCTION_UUID = '5b1f6c2e-3a4d-4e8f-9a0b-1c2d3e4f5a01'
const LNODE_UUID = '5b1f6c2e-3a4d-4e8f-9a0b-1c2d3e4f5a02'
const OTHER_LNODE_UUID = '5b1f6c2e-3a4d-4e8f-9a0b-1c2d3e4f5a03'
const ROLE_UUID = '5b1f6c2e-3a4d-4e8f-9a0b-1c2d3e4f5a04'
const MISSING_UUID = '5b1f6c2e-3a4d-4e8f-9a0b-1c2d3e4f5a99'

const id = CUSTOM_RECORD_ID_ATTRIBUTE

const SOURCE_XML = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} version="2007" revision="C" release="5">
		<Header id="output-gate"/>
		<Substation name="S1">
			<Private type="eIEC61850-6-100">
				<eIEC61850-6-100:AllocationRole name="Operator" uuid="${ROLE_UUID}">
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

async function pointFunctionRefAtNothing(document: SclTest.TestDocument['document']) {
	await document.transaction(async (tx) => {
		await tx.update(
			{ tagName: 'FunctionRef', id: 'function-ref' },
			{ attributes: { functionUuid: MISSING_UUID } },
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

async function openProject() {
	return createTestProject<Config, typeof SCL_TEST_SETUP.extensions.base>({
		sourceXml: SOURCE_XML,
		...SCL_TEST_SETUP,
	})
}

describe('withOutputGate', () => {
	type TestCase = SclTest.BaseTestCase & {
		gatedCase: OutputGateTestCase
		write: (document: SclTest.TestDocument['document']) => Promise<void>
		/** What the gated act rejects with; `undefined` when it resolves. */
		expectedMessage: string | undefined
	}

	const testCases: Record<string, TestCase> = {
		'an act that leaves a dangling reference → rejects, naming the case and the document': {
			gatedCase: { sourceXml: SOURCE_XML },
			write: pointFunctionRefAtNothing,
			expectedMessage: invalidDocumentMessage({
				label: 'gated case › source',
				lines: [
					`[references] [dangling] <FunctionRef> functionUuid="${MISSING_UUID}" points at no element of the document`,
				],
			}),
		},
		'the same act in a case that tolerates a dangling reference → resolves': {
			gatedCase: {
				sourceXml: SOURCE_XML,
				allowInvalidOutput: {
					reason: 'the reference is repaired by the clean-up under test',
					violations: [{ check: 'references', code: 'dangling' }],
				},
			},
			write: pointFunctionRefAtNothing,
			expectedMessage: undefined,
		},
		'an act that throws → its own error, never the gate': {
			gatedCase: { sourceXml: SOURCE_XML },
			async write(document) {
				await pointFunctionRefAtNothing(document)
				throw new Error('the act failed')
			},
			expectedMessage: 'the act failed',
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
			if (testCase.expectedMessage === undefined) await expect(outcome).resolves.toBeUndefined()
			else await expect(outcome).rejects.toThrow(testCase.expectedMessage)
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
		},
		'a test that failed already → no check, its own failure is the one to read': {
			write: giveSecondLNodeTheFirstUuid,
			testFailed: true,
			expectedMessage: undefined,
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
			},
		'a test that leaves a valid document → resolves': {
			async write() {},
			testFailed: false,
			expectedMessage: undefined,
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
		if (testCase.expectedMessage === undefined) await expect(outcome).resolves.toBeUndefined()
		else await expect(outcome).rejects.toThrow(testCase.expectedMessage)
		// destroyed whatever the check found
		await expect(project.getDocuments()).rejects.toThrow()
	}

	runSclTestCases.generic(testCases, act)
})

describe('assertOutputGateTestCases', () => {
	type TestCase = SclTest.BaseTestCase & {
		checkedCases: Record<string, OutputGateTestCase>
		expectedMessage: string | undefined
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
		},
		'cases without an opt-out → accepted': {
			checkedCases: { 'plain case': { sourceXml: SOURCE_XML } },
			expectedMessage: undefined,
		},
	}

	function act(testCase: TestCase) {
		function check() {
			assertOutputGateTestCases({ testCases: testCase.checkedCases })
		}
		if (testCase.expectedMessage === undefined) expect(check).not.toThrow()
		else expect(check).toThrow(testCase.expectedMessage)
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
	}

	function act(testCase: TestCase) {
		expect(testCase.register).toThrow(testCase.expectedMessage)
	}

	runSclTestCases.generic(testCases, act)
})

describe('withOutputGate — the documents of the project', () => {
	const DANGLING_UUID = '5b1f6c2e-3a4d-4e8f-9a0b-1c2d3e4f5a98'
	const sourceXml = /* xml */ `
		<SCL ${ALL_XMLNS_NAMESPACES} version="2007" revision="C" release="5">
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
		<SCL ${ALL_XMLNS_NAMESPACES} version="2007" revision="C" release="5">
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
		<SCL ${ALL_XMLNS_NAMESPACES} version="2007" revision="C" release="5">
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
		const { project, source, target } = await createTestProject<
			Config,
			typeof SCL_TEST_SETUP.extensions.base
		>({ sourceXml, targetXml, ...SCL_TEST_SETUP })
		try {
			const gatedCase: OutputGateTestCase = { sourceXml, targetXml }
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
			else await expect(outcome).rejects.toThrow(testCase.expectedMessage)
		} finally {
			await project.destroy()
		}
	}

	runSclTestCases.generic(testCases, act)
})
