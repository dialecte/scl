import { roleLNodes } from './role-lnodes'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const GHOST = 'a0000000-0000-4000-8000-0000000000ff'

/** A function reference resolves as the reference engine resolves it: its uuid first, else its path. */
describe('roleLNodes - a function reference whose uuid names nothing', () => {
	type TestCase = SclTest.BaseXmlTestCase & { lnodes: string[]; unresolvedFunctionRefs: string[] }

	const testCases: SclTest.TestCases<TestCase> = {
		'a functionUuid naming nothing and a function path naming PROT → resolved by the path': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="R1" ${id}="role">
								<eIEC61850-6-100:FunctionRef function="S1/E1/Q01/PROT" functionUuid="${GHOST}" ${id}="ref-prot"/>
								<!-- no function carries the GHOST uuid; PROT carries none -->
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
			allowIncoherentReferences: 'the uuid names nothing: the path is what the case resolves by',
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
