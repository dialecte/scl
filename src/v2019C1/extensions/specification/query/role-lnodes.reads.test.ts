import threeFunctionsTwoIeds from './fixtures/role-of-three-functions-over-two-ieds.xml?raw'
import { roleLNodes } from './role-lnodes'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const PROT = 'a0000000-0000-4000-8000-000000000001'
const R_PTOC1 = 'b0000000-0000-4000-8000-000000000001'

/** The query reads of one role, the same whatever the number of functions, LNodes and IEDs. */
const READS_OF_A_ROLE = 16

/** Contract: a role's LNodes and their implementers cost a fixed number of query reads, whatever the role's size. */
describe('roleLNodes - a fixed number of reads', () => {
	type TestCase = SclTest.BaseXmlTestCase & { reads: number }

	const testCases: SclTest.TestCases<TestCase> = {
		'one function, one LNode bound by lnUuid, one implemented N to 1 → the reads of a role': {
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
									<LNode iedName="R" ldInst="PROT" prefix="" lnClass="PTOC" lnInst="1" lnUuid="${R_PTOC1}"/>
									<LNode iedName="None" lnClass="PTOC" lnInst="2">
										<Private type="eIEC61850-6-100">
											<eIEC61850-6-100:DOS name="Op" mappedLnUuid="${R_PTOC1}" mappedDoName="Op"/>
										</Private>
									</LNode>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
					<IED name="R">
						<IEDSourceFiles><SclFileReference fileType="ICD" fileName="r.icd"/></IEDSourceFiles>
						<AccessPoint name="AP1"><Server><Authentication/>
							<LDevice inst="PROT">
								<LN0 lnClass="LLN0" inst="" lnType="LLN0_T"/>
								<LN lnClass="PTOC" inst="1" prefix="" lnType="PTOC_T" uuid="${R_PTOC1}"/>
							</LDevice>
						</Server></AccessPoint>
					</IED>
				</SCL>
			`,
			reads: READS_OF_A_ROLE,
		},
		'three functions in two bays, six LNodes over two IEDs and N to 1 → the same reads': {
			// PROT and CTRL in Q01, PROT in Q02, each with two LNodes; R and S implement four, one is N to 1 on R
			sourceXml: threeFunctionsTwoIeds,
			reads: READS_OF_A_ROLE,
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const counting = countQueryReads(source.query)
			await roleLNodes(counting.query, {
				allocationRole: { tagName: 'AllocationRole', id: 'role' },
			})
			expect(counting.reads).toHaveLength(testCase.reads)
		},
	})
})
