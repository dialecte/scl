import { roleLNodes } from './role-lnodes'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const PROT = 'a0000000-0000-4000-8000-000000000001'
const R_PTOC1 = 'b0000000-0000-4000-8000-000000000001'

/** A sub data object carries a mapping too: an SDS naming an LN implements its LNode as a DOS would. */
describe('roleLNodes - an LNode implemented through a sub data object', () => {
	type TestCase = SclTest.BaseXmlTestCase & { implementedBy: Record<string, string> }

	const testCases: SclTest.TestCases<TestCase> = {
		'iedName None, only its SDS mappedLnUuid naming an LN of R → under R': {
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
									<LNode iedName="None" lnClass="PTOC" lnInst="2" ${id}="ptoc2">
										<Private type="eIEC61850-6-100">
											<eIEC61850-6-100:DOS name="Str">
												<!-- the DOS names no LN -->
												<eIEC61850-6-100:SDS name="phsA" mappedLnUuid="${R_PTOC1}" mappedDoName="Str.phsA"/>
											</eIEC61850-6-100:DOS>
										</Private>
									</LNode>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
					<IED name="R" ${id}="ied-r">
						<IEDSourceFiles><SclFileReference fileType="ICD" fileName="r.icd"/></IEDSourceFiles>
						<AccessPoint name="AP1"><Server><Authentication/>
							<LDevice inst="PROT"><LN0 lnClass="LLN0" inst="" lnType="LLN0_T"/><LN lnClass="PTOC" inst="1" prefix="" lnType="PTOC_T" uuid="${R_PTOC1}"/></LDevice>
						</Server></AccessPoint>
					</IED>
				</SCL>
			`,
			implementedBy: { ptoc2: 'ied-r' },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const result = await roleLNodes(source.query, {
				allocationRole: { tagName: 'AllocationRole', id: 'role' },
			})
			const implementedBy = Object.fromEntries(
				result.implementers.flatMap((implementer) =>
					implementer.lnodes.map((lnode) => [lnode.id, implementer.ied.id]),
				),
			)
			expect(implementedBy).toEqual(testCase.implementedBy)
		},
	})
})
