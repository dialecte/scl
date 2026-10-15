import {
	assertCoherentSclReferences,
	assertCoherentSclReferencesTestCases,
	collectReferenceViolations,
} from './assert-coherent-scl-references'
import { ALL_XMLNS_NAMESPACES, runSclTestCases } from './hydrated-test'

import { describe, expect } from 'vitest'

import type {
	ReferenceCoherenceTestCase,
	ReferenceViolation,
} from './assert-coherent-scl-references.types'
import type { SclTest } from './hydrated-test.types'

describe('collectReferenceViolations', () => {
	type TestCase = SclTest.BaseTestCase & {
		xml: string
		expected: ReferenceViolation[]
	}

	const testCases: Record<string, TestCase> = {
		'path written one level short of its target → path violation naming the real path': {
			xml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Substation name="TEMPLATE">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="Operator" uuid="role-uuid">
								<eIEC61850-6-100:FunctionRef function="TEMPLATE/Protection" functionUuid="function-uuid" />
							</eIEC61850-6-100:AllocationRole>
						</Private>
						<VoltageLevel name="TEMPLATE">
							<Bay name="TEMPLATE">
								<Function name="Protection" uuid="function-uuid" />
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expected: [
				{
					kind: 'path',
					referenceTagName: 'FunctionRef',
					pathAttribute: 'function',
					uuidAttribute: 'functionUuid',
					uuid: 'function-uuid',
					written: 'TEMPLATE/Protection',
					expected: 'TEMPLATE/TEMPLATE/TEMPLATE/Protection',
				},
			],
		},
		'uuid carried by no element of the document → dangling violation': {
			xml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Substation name="TEMPLATE">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="Operator" uuid="role-uuid">
								<eIEC61850-6-100:FunctionRef function="TEMPLATE/Protection" functionUuid="function-uuid" />
							</eIEC61850-6-100:AllocationRole>
						</Private>
						<!-- no Function carrying function-uuid -->
					</Substation>
				</SCL>
			`,
			expected: [
				{
					kind: 'dangling',
					referenceTagName: 'FunctionRef',
					uuidAttribute: 'functionUuid',
					uuid: 'function-uuid',
				},
			],
		},
		'uuid carried by an element the reference cannot point at → wrong-target violation': {
			xml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Substation name="TEMPLATE">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="Operator" uuid="role-uuid">
								<eIEC61850-6-100:FunctionRef function="TEMPLATE/Operator" functionUuid="role-uuid" />
							</eIEC61850-6-100:AllocationRole>
						</Private>
					</Substation>
				</SCL>
			`,
			expected: [
				{
					kind: 'wrong-target',
					referenceTagName: 'FunctionRef',
					uuidAttribute: 'functionUuid',
					uuid: 'role-uuid',
					targetTagName: 'AllocationRole',
				},
			],
		},
		'uuid attribute left empty → empty violation': {
			xml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Substation name="TEMPLATE">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="Operator" uuid="role-uuid">
								<eIEC61850-6-100:FunctionRef function="TEMPLATE/Protection" functionUuid="" />
							</eIEC61850-6-100:AllocationRole>
						</Private>
						<Function name="Protection" uuid="function-uuid" />
					</Substation>
				</SCL>
			`,
			expected: [{ kind: 'empty', referenceTagName: 'FunctionRef', uuidAttribute: 'functionUuid' }],
		},
		'path written as the path of its target → no violation': {
			xml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Substation name="TEMPLATE">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="Operator" uuid="role-uuid">
								<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Protection" functionUuid="function-uuid" />
							</eIEC61850-6-100:AllocationRole>
						</Private>
						<VoltageLevel name="TEMPLATE">
							<Bay name="TEMPLATE">
								<Function name="Protection" uuid="function-uuid" />
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expected: [],
		},
		'reference by path only, without a uuid attribute → no violation': {
			xml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Substation name="TEMPLATE">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="Operator" uuid="role-uuid">
								<eIEC61850-6-100:FunctionRef function="TEMPLATE/Elsewhere" />
							</eIEC61850-6-100:AllocationRole>
						</Private>
					</Substation>
				</SCL>
			`,
			expected: [],
		},
		'vendor element named like a reference → no violation': {
			xml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} xmlns:vendor="http://vendor.example/private-elements">
					<Substation name="TEMPLATE">
						<Private type="vendor-wiring">
							<vendor:FunctionRef function="anything" functionUuid="nowhere" />
						</Private>
					</Substation>
				</SCL>
			`,
			expected: [],
		},
		'data reference whose path carries a data qualifier → path left unchecked': {
			xml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Substation name="TEMPLATE">
						<VoltageLevel name="TEMPLATE">
							<Bay name="TEMPLATE">
								<Function name="Protection" uuid="function-uuid">
									<LNode lnClass="PTOC" lnInst="1" iedName="None" uuid="source-lnode-uuid" />
									<LNode lnClass="PTRC" lnInst="1" iedName="None" uuid="sink-lnode-uuid">
										<Private type="eIEC61850-6-100">
											<eIEC61850-6-100:LNodeInputs>
												<eIEC61850-6-100:SourceRef input="Trip" source="PTOC1.Op.general" sourceLNodeUuid="source-lnode-uuid" sourceDoName="Op" sourceDaName="general" />
											</eIEC61850-6-100:LNodeInputs>
										</Private>
									</LNode>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expected: [],
		},
		'reference to a dataflow input, whose path is not a plain name path → path left unchecked': {
			xml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Substation name="TEMPLATE">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:Application name="Tripping" uuid="application-uuid">
								<eIEC61850-6-100:FunctionRole name="Trip logic" uuid="function-role-uuid">
									<eIEC61850-6-100:FunctionRoleContent>
										<eIEC61850-6-100:FunctionRef function="TEMPLATE/Protection" functionUuid="function-uuid">
											<eIEC61850-6-100:SignalRole name="Input" uuid="signal-role-uuid">
												<eIEC61850-6-100:LNodeInputRef sourceRef="TEMPLATE/Protection/PTRC1.Trip(1).general" sourceRefUuid="source-ref-uuid" />
											</eIEC61850-6-100:SignalRole>
										</eIEC61850-6-100:FunctionRef>
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Private>
						<Function name="Protection" uuid="function-uuid">
							<LNode lnClass="PTRC" lnInst="1" iedName="None" uuid="lnode-uuid">
								<Private type="eIEC61850-6-100">
									<eIEC61850-6-100:LNodeInputs>
										<eIEC61850-6-100:SourceRef input="Trip" inputInst="1" pDA="general" pDO="Op" pLN="PTOC" service="Report" uuid="source-ref-uuid" />
									</eIEC61850-6-100:LNodeInputs>
								</Private>
							</LNode>
						</Function>
					</Substation>
				</SCL>
			`,
			expected: [],
		},
		'several incoherent references → each reported, in document order': {
			xml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Substation name="TEMPLATE">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="Operator" uuid="role-uuid">
								<eIEC61850-6-100:FunctionRef function="TEMPLATE/Protection" functionUuid="function-uuid" />
								<eIEC61850-6-100:FunctionRef function="TEMPLATE/Control" functionUuid="missing-uuid" />
							</eIEC61850-6-100:AllocationRole>
						</Private>
						<VoltageLevel name="TEMPLATE">
							<Bay name="TEMPLATE">
								<Function name="Protection" uuid="function-uuid" />
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expected: [
				{
					kind: 'path',
					referenceTagName: 'FunctionRef',
					pathAttribute: 'function',
					uuidAttribute: 'functionUuid',
					uuid: 'function-uuid',
					written: 'TEMPLATE/Protection',
					expected: 'TEMPLATE/TEMPLATE/TEMPLATE/Protection',
				},
				{
					kind: 'dangling',
					referenceTagName: 'FunctionRef',
					uuidAttribute: 'functionUuid',
					uuid: 'missing-uuid',
				},
			],
		},
		'terminal whose level names are not those of the node its uuid names → one derived violation per name':
			{
				xml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<VoltageLevel name="VL1">
								<Bay name="B1">
									<ConductingEquipment name="QA1" type="CBR">
										<Terminal connectivityNode="S1/VL1/B1/L1" lineName="X" substationName="S1" voltageLevelName="VL1" bayName="B9" cNodeName="L1" cNodeUuid="node-uuid" />
									</ConductingEquipment>
									<ConnectivityNode name="L1" pathName="S1/VL1/B1/L1" uuid="node-uuid" />
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				expected: [
					{
						kind: 'derived',
						elementTagName: 'Terminal',
						attribute: 'lineName',
						written: 'X',
						expected: undefined,
					},
					{
						kind: 'derived',
						elementTagName: 'Terminal',
						attribute: 'bayName',
						written: 'B9',
						expected: 'B1',
					},
				],
			},
		'connectivity node whose pathName is not its position → derived violation': {
			xml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Substation name="S1">
						<VoltageLevel name="VL1">
							<Bay name="B1">
								<ConnectivityNode name="L1" pathName="S1/VL1/B0/L1" uuid="node-uuid" />
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expected: [
				{
					kind: 'derived',
					elementTagName: 'ConnectivityNode',
					attribute: 'pathName',
					written: 'S1/VL1/B0/L1',
					expected: 'S1/VL1/B1/L1',
				},
			],
		},
		'terminal without its optional level names → no violation': {
			xml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Substation name="S1">
						<VoltageLevel name="VL1">
							<Bay name="B1">
								<ConductingEquipment name="QA1" type="CBR">
									<Terminal connectivityNode="S1/VL1/B1/L1" cNodeName="L1" cNodeUuid="node-uuid" />
								</ConductingEquipment>
								<ConnectivityNode name="L1" pathName="S1/VL1/B1/L1" uuid="node-uuid" />
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expected: [],
		},
		'malformed document → no violation, the structural check reports it': {
			xml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Substation name="TEMPLATE">
				</Substation>
				</SCL>
			`,
			expected: [],
		},
	}

	function act(testCase: TestCase) {
		expect(collectReferenceViolations({ xml: testCase.xml })).toEqual(testCase.expected)
	}

	runSclTestCases.generic(testCases, act)
})

const shortPathXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES}>
		<Substation name="TEMPLATE">
			<Private type="eIEC61850-6-100">
				<eIEC61850-6-100:AllocationRole name="Operator" uuid="role-uuid">
					<eIEC61850-6-100:FunctionRef function="TEMPLATE/Protection" functionUuid="function-uuid" />
				</eIEC61850-6-100:AllocationRole>
			</Private>
			<VoltageLevel name="TEMPLATE">
				<Bay name="TEMPLATE">
					<Function name="Protection" uuid="function-uuid" />
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const danglingXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES}>
		<Substation name="TEMPLATE">
			<Private type="eIEC61850-6-100">
				<eIEC61850-6-100:AllocationRole name="Operator" uuid="role-uuid">
					<eIEC61850-6-100:FunctionRef function="TEMPLATE/Protection" functionUuid="function-uuid" />
				</eIEC61850-6-100:AllocationRole>
			</Private>
			<!-- no Function carrying function-uuid -->
		</Substation>
	</SCL>
`

const coherentXml = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES}>
		<Substation name="TEMPLATE">
			<Private type="eIEC61850-6-100">
				<eIEC61850-6-100:AllocationRole name="Operator" uuid="role-uuid">
					<eIEC61850-6-100:FunctionRef function="TEMPLATE/Protection" functionUuid="function-uuid" />
				</eIEC61850-6-100:AllocationRole>
			</Private>
			<Function name="Protection" uuid="function-uuid" />
		</Substation>
	</SCL>
`

function captureErrorMessage(run: () => void): string {
	try {
		run()
	} catch (error) {
		return (error as Error).message
	}
	return ''
}

describe('assertCoherentSclReferences', () => {
	type TestCase = SclTest.BaseTestCase & {
		xml: string
		expectedMessage: string
	}

	const testCases: Record<string, TestCase> = {
		'incoherent document → throws, naming the document and the path to write': {
			xml: shortPathXml,
			expectedMessage: [
				'sourceXml: incoherent references:',
				'  [path] <FunctionRef> function="TEMPLATE/Protection" is not the path of the element functionUuid="function-uuid" points at, which is "TEMPLATE/TEMPLATE/TEMPLATE/Protection"',
			].join('\n'),
		},
		'coherent document → does not throw': {
			xml: coherentXml,
			expectedMessage: '',
		},
		'uuid on an element the reference cannot point at → throws, naming that element': {
			xml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Substation name="TEMPLATE">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="Operator" uuid="role-uuid">
								<eIEC61850-6-100:FunctionRef function="TEMPLATE/Operator" functionUuid="role-uuid" />
							</eIEC61850-6-100:AllocationRole>
						</Private>
					</Substation>
				</SCL>
			`,
			expectedMessage: [
				'sourceXml: incoherent references:',
				'  [wrong-target] <FunctionRef> functionUuid="role-uuid" points at a <AllocationRole>, which it cannot reference',
			].join('\n'),
		},
		'empty uuid → throws, naming the empty attribute': {
			xml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Substation name="TEMPLATE">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="Operator" uuid="role-uuid">
								<eIEC61850-6-100:FunctionRef function="TEMPLATE/Protection" functionUuid="" />
							</eIEC61850-6-100:AllocationRole>
						</Private>
					</Substation>
				</SCL>
			`,
			expectedMessage: [
				'sourceXml: incoherent references:',
				'  [empty] <FunctionRef> functionUuid is empty',
			].join('\n'),
		},
		'dangling uuid → throws, naming the uuid that points at nothing': {
			xml: danglingXml,
			expectedMessage: [
				'sourceXml: incoherent references:',
				'  [dangling] <FunctionRef> functionUuid="function-uuid" points at no element of the document',
			].join('\n'),
		},
	}

	function act(testCase: TestCase) {
		const message = captureErrorMessage(() =>
			assertCoherentSclReferences({ xml: testCase.xml, label: 'sourceXml' }),
		)
		expect(message).toBe(testCase.expectedMessage)
	}

	runSclTestCases.generic(testCases, act)
})

describe('assertCoherentSclReferencesTestCases', () => {
	type TestCase = SclTest.BaseTestCase & {
		checkedCases: Record<string, ReferenceCoherenceTestCase>
		expectedMessage: string
	}

	const testCases: Record<string, TestCase> = {
		'two incoherent cases → one failure naming both, each under its case and document': {
			checkedCases: {
				'first case': { sourceXml: shortPathXml },
				'second case': { sourceXml: coherentXml, targetXml: danglingXml },
			},
			expectedMessage: [
				'first case › sourceXml: incoherent references:',
				'  [path] <FunctionRef> function="TEMPLATE/Protection" is not the path of the element functionUuid="function-uuid" points at, which is "TEMPLATE/TEMPLATE/TEMPLATE/Protection"',
				'second case › targetXml: incoherent references:',
				'  [dangling] <FunctionRef> functionUuid="function-uuid" points at no element of the document',
			].join('\n'),
		},
		'incoherent case that says why it needs to be → left unchecked': {
			checkedCases: {
				'orphan to clean up': {
					sourceXml: danglingXml,
					allowIncoherentReferences: 'the dangling reference is what the clean-up removes',
				},
			},
			expectedMessage: '',
		},
	}

	function act(testCase: TestCase) {
		const message = captureErrorMessage(() =>
			assertCoherentSclReferencesTestCases({ testCases: testCase.checkedCases }),
		)
		expect(message).toBe(testCase.expectedMessage)
	}

	runSclTestCases.generic(testCases, act)
})
