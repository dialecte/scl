import {
	assertNoNewSclOutputViolations,
	collectSclOutputViolations,
	xsdCodeOf,
} from './assert-scl-output'
import { SCL_OUTPUT_CHECK } from './assert-scl-output.constants'
import { ALL_XMLNS_NAMESPACES, runSclTestCases } from './hydrated-test'
import { isSclXsdConfigured } from './scl-xsd'

import { createTestProject, XmlAssertionError } from '@dialecte/core/test'
import { describe, expect } from 'vitest'

import { SCL_DIALECTE } from '@/v2019C1/declaration.constants'

import type {
	SclOutputCheck,
	SclOutputOptOut,
	SclOutputViolation,
	SclXsdCode,
} from './assert-scl-output.types'
import type { SclTest } from './hydrated-test.types'

const FUNCTION_UUID = '0f9a2c55-7c39-4f4e-9d6a-2a7b8c1d0e01'
const LNODE_UUID = '0f9a2c55-7c39-4f4e-9d6a-2a7b8c1d0e02'
const OTHER_LNODE_UUID = '0f9a2c55-7c39-4f4e-9d6a-2a7b8c1d0e03'
const THIRD_LNODE_UUID = '0f9a2c55-7c39-4f4e-9d6a-2a7b8c1d0e06'
const BEHAVIOUR_UUID = '0f9a2c55-7c39-4f4e-9d6a-2a7b8c1d0e04'
const ROLE_UUID = '0f9a2c55-7c39-4f4e-9d6a-2a7b8c1d0e05'
const MISSING_UUID = '0f9a2c55-7c39-4f4e-9d6a-2a7b8c1d0e99'

/** A valid SCL file holding one function; `bayContent` and `functionContent` are placed in its bay and function. */
function sclFile(params: {
	bayContent?: string
	functionContent?: string
	substationContent?: string
}) {
	const { bayContent = '', functionContent = '', substationContent = '' } = params
	return /* xml */ `
		<SCL ${ALL_XMLNS_NAMESPACES} version="2007" revision="C" release="5">
			<Header id="output-check"/>
			<Substation name="S1">
				${substationContent}
				<VoltageLevel name="V1">
					<Bay name="B1">
						${bayContent}
						<Function name="F1" uuid="${FUNCTION_UUID}">
							<LNode iedName="None" ldInst="LD1" prefix="" lnClass="CSWI" lnInst="1" uuid="${LNODE_UUID}"/>
							${functionContent}
						</Function>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

describe('collectSclOutputViolations', () => {
	type TestCase = SclTest.BaseTestCase & {
		sourceXml: string
		/** Read the document as a hand-made test document. */
		asTestDocument?: boolean
		/** The checks reporting, in order, one entry per violation. */
		expectedChecks: SclOutputCheck[]
		/** The exact lines of the checks other than the validator (whose wording is its own). */
		expectedDescriptions: string[]
	}

	const testCases: Record<string, TestCase> = {
		'a valid file → nothing': {
			sourceXml: sclFile({}),
			expectedChecks: [],
			expectedDescriptions: [],
		},
		'two inputs of one behaviour description with one variable name → uniqueness, and the validator':
			{
				sourceXml: sclFile({
					functionContent: /* xml */ `
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:BehaviorDescription name="BD1" uuid="${BEHAVIOUR_UUID}">
								<eIEC61850-6-100:InputVar varName="in1" dataName="CSWI1" lnodeUuid="${LNODE_UUID}"/>
								<eIEC61850-6-100:InputVar varName="in1" dataName="CSWI1" lnodeUuid="${LNODE_UUID}"/>
							</eIEC61850-6-100:BehaviorDescription>
						</Private>
					`,
				}),
				expectedChecks: ['xsd', 'uniqueness'],
				expectedDescriptions: [
					'[uniqueness] <InputVar> varName="in1" repeats an earlier sibling under SCL/Substation[S1]/VoltageLevel[V1]/Bay[B1]/Function[F1]/BehaviorDescription[BD1] (uniqueChildNameInBehaviorDescription)',
				],
			},
		'two logical nodes of one function with one identity → uniqueness, and the validator': {
			sourceXml: sclFile({
				functionContent: /* xml */ `
					<LNode iedName="None" ldInst="LD1" prefix="P" lnClass="XCBR" lnInst="1" uuid="${OTHER_LNODE_UUID}"/>
					<LNode iedName="None" ldInst="LD1" prefix="P" lnClass="XCBR" lnInst="1" uuid="${THIRD_LNODE_UUID}"/>
				`,
			}),
			expectedChecks: ['xsd', 'uniqueness'],
			expectedDescriptions: [
				'[uniqueness] <LNode> lnInst="1" lnClass="XCBR" iedName="None" ldInst="LD1" prefix="P" repeats an earlier sibling under SCL/Substation[S1]/VoltageLevel[V1]/Bay[B1]/Function[F1] (uniqueLNodeInFunctionB)',
			],
		},
		'two logical nodes with one identity whose prefix is left out (its default) → the validator only':
			{
				sourceXml: sclFile({
					functionContent: /* xml */ `<LNode iedName="None" ldInst="LD1" lnClass="CSWI" lnInst="1" uuid="${OTHER_LNODE_UUID}"/>`,
				}),
				expectedChecks: ['xsd'],
				expectedDescriptions: [],
			},
		'a function reference naming no function → references': {
			sourceXml: sclFile({
				substationContent: /* xml */ `
					<Private type="eIEC61850-6-100">
						<eIEC61850-6-100:AllocationRole name="Operator" uuid="${ROLE_UUID}">
							<eIEC61850-6-100:FunctionRef functionUuid="${MISSING_UUID}"/>
						</eIEC61850-6-100:AllocationRole>
					</Private>
				`,
			}),
			expectedChecks: ['references'],
			expectedDescriptions: [
				`[references] [dangling] <FunctionRef> functionUuid="${MISSING_UUID}" points at no element of the document`,
			],
		},
		'two elements with one uuid → identity, and the validator': {
			sourceXml: sclFile({
				functionContent: /* xml */ `<LNode iedName="None" ldInst="LD1" prefix="" lnClass="CSWI" lnInst="2" uuid="${LNODE_UUID}"/>`,
			}),
			expectedChecks: ['xsd', 'identity'],
			expectedDescriptions: [
				`[identity] duplicate-instance-uuid: uuid "${LNODE_UUID}" is used by 2 elements (LNode); every instance UUID in an SCL shall be unique.`,
			],
		},
		'a logical node in the 6-100 namespace under a bay → schema': {
			sourceXml: sclFile({
				bayContent: /* xml */ `<eIEC61850-6-100:LNode iedName="None" lnClass="XCBR" lnInst="1"/>`,
			}),
			expectedChecks: ['schema'],
			expectedDescriptions: [
				'[schema] [namespace] <eIEC61850-6-100:LNode> under <Bay>: is in http://www.iec.ch/61850/2019/SCL/6-100, schema declares http://www.iec.ch/61850/2003/SCL',
			],
		},
		'a logical node class the schema refuses → the validator only': {
			sourceXml: sclFile({
				functionContent: /* xml */ `<LNode iedName="None" ldInst="LD1" prefix="" lnClass="DomainLN" lnInst="1" uuid="${OTHER_LNODE_UUID}"/>`,
			}),
			// the class on the logical node (with the validator's note that it holds no value) and on the
			// specification naming the import writes for it
			expectedChecks: ['xsd', 'xsd', 'xsd'],
			expectedDescriptions: [],
		},
		'a file without a Header → the validator stops at the missing Header': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} version="2007" revision="C" release="5">
					<Substation name="S1">
						<VoltageLevel name="V1">
							<Bay name="B1">
								<Function name="F1" uuid="${FUNCTION_UUID}">
									<LNode iedName="None" ldInst="LD1" lnClass="DomainLN" lnInst="1" uuid="${LNODE_UUID}"/>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedChecks: ['xsd'],
			expectedDescriptions: [],
		},
		'the same file read as a test document → given a Header, the validator reads its content': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} version="2007" revision="C" release="5">
					<Substation name="S1">
						<VoltageLevel name="V1">
							<Bay name="B1">
								<Function name="F1" uuid="${FUNCTION_UUID}">
									<LNode iedName="None" ldInst="LD1" lnClass="DomainLN" lnInst="1" uuid="${LNODE_UUID}"/>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			asTestDocument: true,
			// the class on the logical node and on the specification naming the import writes for it
			expectedChecks: ['xsd', 'xsd'],
			expectedDescriptions: [],
		},
		'a readable test uuid → refused by the validator': {
			sourceXml: sclFile({
				functionContent: /* xml */ `<LNode iedName="None" ldInst="LD1" lnClass="XCBR" lnInst="1" uuid="breaker-lnode-uuid"/>`,
			}),
			// the pattern, and the validator's note that the uuid key could not read the value
			expectedChecks: ['xsd', 'xsd'],
			expectedDescriptions: [],
		},
		'the same uuid read in a test document → read as a uuid': {
			sourceXml: sclFile({
				functionContent: /* xml */ `<LNode iedName="None" ldInst="LD1" lnClass="XCBR" lnInst="1" uuid="breaker-lnode-uuid"/>`,
			}),
			asTestDocument: true,
			expectedChecks: [],
			expectedDescriptions: [],
		},
		'a name written as a uuid in a test document → still refused': {
			sourceXml: sclFile({
				functionContent: /* xml */ `<LNode iedName="None" ldInst="LD1" lnClass="XCBR" lnInst="1" uuid="Breaker"/>`,
			}),
			asTestDocument: true,
			expectedChecks: ['xsd'],
			expectedDescriptions: [],
		},
	}

	async function act(testCase: TestCase) {
		const { project, source } = await createTestProject({
			dialecte: SCL_DIALECTE,
			sourceXml: testCase.sourceXml,
		})
		try {
			const { checks, violations } = await collectSclOutputViolations({
				project,
				document: source.document,
				asTestDocument: testCase.asTestDocument,
			})
			// without the schema files the validator does not run, and the report says so
			const xsdRan = isSclXsdConfigured()
			expect(checks).toEqual(
				Object.values(SCL_OUTPUT_CHECK).filter((check) => xsdRan || check !== SCL_OUTPUT_CHECK.xsd),
			)
			expect(violations.map((violation) => violation.check)).toEqual(
				testCase.expectedChecks.filter((check) => xsdRan || check !== SCL_OUTPUT_CHECK.xsd),
			)
			expect(
				violations
					.filter((violation) => violation.check !== SCL_OUTPUT_CHECK.xsd)
					.map((violation) => violation.description),
			).toEqual(testCase.expectedDescriptions)
		} finally {
			await project.destroy()
		}
	}

	runSclTestCases.generic(testCases, act)
})

describe('assertNoNewSclOutputViolations', () => {
	type TestCase = SclTest.BaseTestCase & {
		before: SclOutputViolation[]
		after: SclOutputViolation[]
		carried?: SclOutputViolation[]
		allowInvalidOutput?: SclOutputOptOut
		/** The checks that ran; every check when left out. */
		checks?: SclOutputCheck[]
		/** The error message; `undefined` when nothing is thrown. */
		expectedMessage: string | undefined
		/** The kind thrown: an assertion miss, or a test defect (plain `Error`); `undefined` when nothing is thrown. */
		expectedError: 'assertion' | 'plain' | undefined
	}

	const danglingLine =
		'[references] [dangling] <FunctionRef> functionUuid="x" points at no element of the document'
	const dangling: SclOutputViolation = {
		check: 'references',
		code: 'dangling',
		description: danglingLine,
		key: danglingLine,
	}
	const duplicateUuidLine =
		'[identity] duplicate-instance-uuid: uuid "y" is used by 2 elements (LNode)'
	const duplicateUuid: SclOutputViolation = {
		check: 'identity',
		code: 'duplicate-instance-uuid',
		description: duplicateUuidLine,
		key: duplicateUuidLine,
	}
	function missingChild(expected: string): SclOutputViolation {
		const message = `Element 'Substation': Missing child element(s). Expected is ${expected}.`
		return {
			check: 'xsd',
			code: 'missing-child',
			description: `[xsd] ${message}`,
			key: "[xsd] Element 'Substation': Missing child element(s).",
			message,
		}
	}

	const testCases: Record<string, TestCase> = {
		'no violation after → nothing': {
			before: [],
			after: [],
			expectedMessage: undefined,
			expectedError: undefined,
		},
		'a violation the input already held → not reported': {
			before: [dangling],
			after: [dangling],
			expectedMessage: undefined,
			expectedError: undefined,
		},
		'a violation the act added → reported under the label': {
			before: [dangling],
			after: [dangling, duplicateUuid],
			expectedMessage: `case › source: the document left is not a valid SCL file:\n  ${duplicateUuid.description}`,
			expectedError: 'assertion',
		},
		'a violation copied from a document the act read from → not reported': {
			before: [],
			after: [dangling],
			carried: [dangling],
			expectedMessage: undefined,
			expectedError: undefined,
		},
		'a violation the input held, the validator now expecting other children there → not reported': {
			before: [missingChild('one of ( Private, VoltageLevel )')],
			after: [missingChild('one of ( VoltageLevel )')],
			expectedMessage: undefined,
			expectedError: undefined,
		},
		'a second copy of a violation the input held → reported': {
			before: [dangling],
			after: [dangling, dangling],
			expectedMessage: `case › source: the document left is not a valid SCL file:\n  ${dangling.description}`,
			expectedError: 'assertion',
		},
		'a violation an opt-out tolerates by check and code → not reported': {
			before: [],
			after: [duplicateUuid],
			allowInvalidOutput: {
				reason: 'the clean-up under test removes the duplicate in a second step',
				violations: [{ check: 'identity', code: 'duplicate-instance-uuid' }],
			},
			expectedMessage: undefined,
			expectedError: undefined,
		},
		'a violation an opt-out tolerates by check alone → not reported': {
			before: [],
			after: [duplicateUuid],
			allowInvalidOutput: {
				reason: 'the clean-up runs later',
				violations: [{ check: 'identity' }],
			},
			expectedMessage: undefined,
			expectedError: undefined,
		},
		'a violation the opt-out does not list → still reported': {
			before: [],
			after: [duplicateUuid, dangling],
			allowInvalidOutput: {
				reason: 'the clean-up under test removes the duplicate in a second step',
				violations: [{ check: 'identity', code: 'duplicate-instance-uuid' }],
			},
			expectedMessage: `case › source: the document left is not a valid SCL file:\n  ${dangling.description}`,
			expectedError: 'assertion',
		},
		'an opt-out the case no longer needs → reported as stale': {
			before: [],
			after: [],
			allowInvalidOutput: {
				reason: 'the reference is repaired later',
				violations: [{ check: 'references', code: 'dangling' }],
			},
			expectedMessage:
				'case › source: the document left is not a valid SCL file:\n  [opt-out] allows references dangling, which the case no longer leaves: remove it',
			expectedError: 'plain',
		},
		'an opt-out for a check that did not run → not stale': {
			before: [],
			after: [],
			allowInvalidOutput: { reason: 'an empty category', violations: [{ check: 'xsd' }] },
			checks: ['schema', 'uniqueness', 'references', 'identity'],
			expectedMessage: undefined,
			expectedError: undefined,
		},
		'a violation added when the XSD validator did not run → reported, saying so': {
			before: [],
			after: [dangling],
			checks: ['schema', 'uniqueness', 'references', 'identity'],
			expectedMessage: `case › source: the document left is not a valid SCL file (checked without the XSD validator):\n  ${dangling.description}`,
			expectedError: 'assertion',
		},
		'an opt-out with an empty reason → refused': {
			before: [],
			after: [],
			allowInvalidOutput: { reason: '', violations: [{ check: 'identity' }] },
			expectedMessage:
				'case › source: allowInvalidOutput needs the reason the case leaves an invalid document, not an empty string',
			expectedError: 'plain',
		},
		'an opt-out with no violation → refused': {
			before: [],
			after: [],
			allowInvalidOutput: { reason: 'an orphan to clean up', violations: [] },
			expectedMessage:
				'case › source: allowInvalidOutput needs the violations the case may leave, not an empty list',
			expectedError: 'plain',
		},
	}

	function act(testCase: TestCase) {
		const thrown = captureThrown(() =>
			assertNoNewSclOutputViolations({
				before: testCase.before,
				after: testCase.after,
				carried: testCase.carried,
				label: 'case › source',
				allowInvalidOutput: testCase.allowInvalidOutput,
				checks: testCase.checks,
			}),
		)
		expect(captureErrorMessage(thrown)).toBe(testCase.expectedMessage)
		if (testCase.expectedError === 'assertion') {
			expect(thrown).toBeInstanceOf(XmlAssertionError)
			expect(thrown).toMatchObject({ name: 'AssertionError' })
		} else if (testCase.expectedError === 'plain') {
			expect(thrown).toBeInstanceOf(Error)
			expect(thrown).not.toBeInstanceOf(XmlAssertionError)
			expect(thrown).toMatchObject({ name: 'Error' })
		}
	}

	runSclTestCases.generic(testCases, act)
})

function captureThrown(run: () => void): unknown {
	try {
		run()
	} catch (error) {
		return error
	}
	return undefined
}

function captureErrorMessage(thrown: unknown): string | undefined {
	if (thrown === undefined) return undefined
	return thrown instanceof Error ? thrown.message : String(thrown)
}

describe('xsdCodeOf', () => {
	type TestCase = SclTest.BaseTestCase & { message: string; expected: SclXsdCode }

	const scl = '{http://www.iec.ch/61850/2003/SCL}'
	const testCases: Record<string, TestCase> = {
		'a value refused by its pattern → pattern': {
			message: `Element '${scl}Function', attribute 'uuid': [facet 'pattern'] The value 'x' is not accepted by the pattern '[0-9a-f]{8}'.`,
			expected: 'pattern',
		},
		'a value outside its type → value': {
			message: `Element '${scl}LNode', attribute 'lnClass': 'DomainLN' is not a valid value of the union type '${scl}tLNClassEnum'.`,
			expected: 'value',
		},
		'a required child missing → missing-child': {
			message: `Element '${scl}Substation': Missing child element(s). Expected is one of ( ${scl}VoltageLevel ).`,
			expected: 'missing-child',
		},
		'a child where it is not expected → unexpected-child': {
			message: `Element '${scl}Substation': This element is not expected. Expected is one of ( ${scl}Header ).`,
			expected: 'unexpected-child',
		},
		'a required attribute missing → required-attribute': {
			message: `Element '${scl}Header': The attribute 'uuid' is required but missing.`,
			expected: 'required-attribute',
		},
		'an attribute its element does not declare → unknown-attribute': {
			message: `Element '${scl}Bay', attribute 'colour': The attribute 'colour' is not allowed.`,
			expected: 'unknown-attribute',
		},
		'two elements with one unique key → duplicate-key': {
			message: `Element '${scl}LNode': Duplicate key-sequence ['1'] in unique identity-constraint '${scl}uniqueLNodeInFunctionB'.`,
			expected: 'duplicate-key',
		},
		'a key reference naming nothing → keyref': {
			message: `Element '${scl}LN0': No match found for key-sequence ['LLN0Type', 'LLN0'] of keyref '${scl}ref2LNodeTypeLLN0'.`,
			expected: 'keyref',
		},
		'any other message → other': {
			message: `Element '${scl}LNode', attribute 'lnClass': Warning: No precomputed value available, the value was either invalid or something strange happened.`,
			expected: 'other',
		},
	}

	function act(testCase: TestCase) {
		expect(xsdCodeOf(testCase.message)).toBe(testCase.expected)
	}

	runSclTestCases.generic(testCases, act)
})
