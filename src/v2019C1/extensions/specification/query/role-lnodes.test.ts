import { roleLNodes } from './role-lnodes'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const PROT = 'a0000000-0000-4000-8000-000000000001'
const PROT_I = 'a0000000-0000-4000-8000-000000000002'
const CTRL = 'a0000000-0000-4000-8000-000000000003'
const TRIP = 'a0000000-0000-4000-8000-000000000004'
const GHOST = 'a0000000-0000-4000-8000-0000000000ff'

/** Which LNodes a role holds: those below the functions it names, once each, in document order. */
describe('roleLNodes - the LNodes of a role', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		lnodes: string[]
		unresolvedFunctionRefs: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a function and its subfunction both named → the subfunction LNode listed once': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="R1" ${id}="role">
								<eIEC61850-6-100:FunctionRef function="S1/E1/Q01/PROT" functionUuid="${PROT}"/>
								<eIEC61850-6-100:FunctionRef function="S1/E1/Q01/PROT/I" functionUuid="${PROT_I}"/>
							</eIEC61850-6-100:AllocationRole>
						</Private>
						<VoltageLevel name="E1">
							<Bay name="Q01">
								<Function name="PROT" uuid="${PROT}">
									<LNode iedName="None" lnClass="PTOC" lnInst="1" ${id}="ptoc1"/>
									<SubFunction name="I" uuid="${PROT_I}">
										<LNode iedName="None" lnClass="PTOC" lnInst="2" ${id}="ptoc2"/>
									</SubFunction>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			lnodes: ['ptoc1', 'ptoc2'],
			unresolvedFunctionRefs: [],
		},
		'a role naming CTRL before PROT → the LNodes in document order, PROT first': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="R1" ${id}="role">
								<eIEC61850-6-100:FunctionRef function="S1/E1/Q01/CTRL" functionUuid="${CTRL}"/>
								<eIEC61850-6-100:FunctionRef function="S1/E1/Q01/PROT" functionUuid="${PROT}"/>
							</eIEC61850-6-100:AllocationRole>
						</Private>
						<VoltageLevel name="E1">
							<Bay name="Q01">
								<Function name="PROT" uuid="${PROT}">
									<LNode iedName="None" lnClass="PTOC" lnInst="1" ${id}="ptoc1"/>
									<LNode iedName="None" lnClass="PTRC" lnInst="1" ${id}="ptrc1"/>
								</Function>
								<Function name="CTRL" uuid="${CTRL}">
									<LNode iedName="None" lnClass="CSWI" lnInst="1" ${id}="cswi1"/>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			lnodes: ['ptoc1', 'ptrc1', 'cswi1'],
			unresolvedFunctionRefs: [],
		},
		'a FunctionRef whose functionUuid names nothing → listed as unresolved, the other resolved': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="R1" ${id}="role">
								<eIEC61850-6-100:FunctionRef function="S1/E1/Q01/PROT" functionUuid="${PROT}"/>
								<eIEC61850-6-100:FunctionRef functionUuid="${GHOST}" ${id}="ref-ghost"/>
								<!-- no function carries the GHOST uuid -->
							</eIEC61850-6-100:AllocationRole>
						</Private>
						<VoltageLevel name="E1">
							<Bay name="Q01">
								<Function name="PROT" uuid="${PROT}">
									<LNode iedName="None" lnClass="PTOC" lnInst="1" ${id}="ptoc1"/>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			allowIncoherentReferences: 'the unresolved function reference is what the case reports',
			lnodes: ['ptoc1'],
			unresolvedFunctionRefs: ['ref-ghost'],
		},
		'an EqFunction under a ConductingEquipment named → its LNodes listed': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="R1" ${id}="role">
								<eIEC61850-6-100:FunctionRef function="S1/E1/Q01/QA1/TRIP" functionUuid="${TRIP}"/>
							</eIEC61850-6-100:AllocationRole>
						</Private>
						<VoltageLevel name="E1">
							<Bay name="Q01">
								<ConductingEquipment name="QA1" type="CBR">
									<EqFunction name="TRIP" uuid="${TRIP}">
										<LNode iedName="None" lnClass="XCBR" lnInst="1" ${id}="xcbr1"/>
									</EqFunction>
								</ConductingEquipment>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			lnodes: ['xcbr1'],
			unresolvedFunctionRefs: [],
		},
		'a FunctionRef with a function path only → resolved, its LNodes listed': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="R1" ${id}="role">
								<eIEC61850-6-100:FunctionRef function="S1/E1/Q01/PROT"/>
								<!-- no functionUuid -->
							</eIEC61850-6-100:AllocationRole>
						</Private>
						<VoltageLevel name="E1">
							<Bay name="Q01">
								<Function name="PROT">
									<LNode iedName="None" lnClass="PTOC" lnInst="1" ${id}="ptoc1"/>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			lnodes: ['ptoc1'],
			unresolvedFunctionRefs: [],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const result = await roleLNodes(source.query, {
				allocationRole: { tagName: 'AllocationRole', id: 'role' },
			})
			expect({
				lnodes: result.lnodes.map((lnode) => lnode.id),
				unresolvedFunctionRefs: result.unresolvedFunctionRefs.map((ref) => ref.id),
			}).toEqual({
				lnodes: testCase.lnodes,
				unresolvedFunctionRefs: testCase.unresolvedFunctionRefs,
			})
		},
	})
})
