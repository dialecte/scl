import { roleLNodes } from './role-lnodes'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const PROT = 'a0000000-0000-4000-8000-000000000001'

/** What is not one of a role's LNodes: a role naming no function holds none; vendor payload is not the document's. */
describe('roleLNodes - nothing to list', () => {
	type TestCase = SclTest.BaseXmlTestCase & { lnodes: string[] }

	const testCases: SclTest.TestCases<TestCase> = {
		'a role holding no FunctionRef → every list empty': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="R1" ${id}="role"/>
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
			lnodes: [],
		},
		'an LNode wrapped in a Private of the named function → not listed': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="R1" ${id}="role">
								<eIEC61850-6-100:FunctionRef function="S1/E1/Q01/PROT" functionUuid="${PROT}"/>
							</eIEC61850-6-100:AllocationRole>
						</Private>
						<VoltageLevel name="E1">
							<Bay name="Q01">
								<Function name="PROT" uuid="${PROT}">
									<Private type="vendor">
										<LNode iedName="None" lnClass="PTRC" lnInst="1" ${id}="vendor-ptrc1"/>
									</Private>
									<LNode iedName="None" lnClass="PTOC" lnInst="1" ${id}="ptoc1"/>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			lnodes: ['ptoc1'],
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
				implementers: result.implementers,
				unimplemented: result.unimplemented.map((lnode) => lnode.id),
				unresolvedFunctionRefs: result.unresolvedFunctionRefs,
			}).toEqual({
				lnodes: testCase.lnodes,
				implementers: [],
				unimplemented: testCase.lnodes,
				unresolvedFunctionRefs: [],
			})
		},
	})
})
