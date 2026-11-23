import threeFunctionsNamedByPath from './fixtures/role-of-three-functions-named-by-path.xml?raw'
import { roleLNodes } from './role-lnodes'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** The query reads of a role naming functions by path, the same whatever the number of functions and their depth. */
const READS_OF_A_ROLE_NAMED_BY_PATH = 16

/** Contract: function references resolved by path keep the reads of a role fixed, whatever its size and depth. */
describe('roleLNodes - a fixed number of reads with function paths', () => {
	type TestCase = SclTest.BaseXmlTestCase & { reads: number }

	const testCases: SclTest.TestCases<TestCase> = {
		'one function named by path, a real IED → the reads of a role named by path': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="R1" ${id}="role">
								<eIEC61850-6-100:FunctionRef function="S1/E1/Q01/PROT"/>
							</eIEC61850-6-100:AllocationRole>
						</Private>
						<VoltageLevel name="E1">
							<Bay name="Q01">
								<Function name="PROT">
									<LNode iedName="None" lnClass="PTOC" lnInst="1"/>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
					<IED name="R">
						<IEDSourceFiles><SclFileReference fileType="ICD" fileName="r.icd"/></IEDSourceFiles>
						<AccessPoint name="AP1"><Server><Authentication/>
							<LDevice inst="PROT"><LN0 lnClass="LLN0" inst="" lnType="LLN0_T"/></LDevice>
						</Server></AccessPoint>
					</IED>
				</SCL>
			`,
			reads: READS_OF_A_ROLE_NAMED_BY_PATH,
		},
		'three functions in two bays, two by path, one a nested subfunction → the same reads': {
			// PROT (Q01) and PROT/I (Q02, holding II) named by path, CTRL by uuid; R implements one LNode
			sourceXml: threeFunctionsNamedByPath,
			reads: READS_OF_A_ROLE_NAMED_BY_PATH,
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
