import { indexProcessSection } from './index-process-section'
import { planProcessFrames } from './plan-process-frames'

import { describe, expect } from 'vitest'

import { readProcessSection } from '@/v2019C1/extensions/dataflow/query/process-section'
import { readSatelliteIndex } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** Contract: the process part is planned from the LNodes given, whatever implements them. */
describe('planProcessFrames - the frame of a given LNode set', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		lnodes: string[]
		expectedRoots: string[]
		/** Whether each named element is left out of the process part. */
		expectedLeftOut: Record<string, boolean>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		"an LNode on no IED given, an LNode of A not given → the first one's function planned, the other left out":
			{
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1" ${id}="s1">
						<VoltageLevel name="E1" ${id}="e1">
							<Bay name="Q01" ${id}="q01">
								<Function name="PROT" ${id}="prot">
									<LNode iedName="None" lnClass="PTRC" lnInst="1" ${id}="ptrc1"/>
								</Function>
								<Function name="CTRL" ${id}="ctrl">
									<LNode iedName="A" ldInst="LD1" prefix="" lnClass="CSWI" lnInst="1" ${id}="cswi1"/>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
					<IED name="A">
						<AccessPoint name="AP1"><Server><Authentication/>
							<LDevice inst="LD1">
								<LN0 lnClass="LLN0" inst="" lnType="LLN0_T"/>
								<LN lnClass="CSWI" inst="1" prefix="" lnType="CSWI_T"/>
							</LDevice>
						</Server></AccessPoint>
					</IED>
				</SCL>
			`,
				lnodes: ['ptrc1'],
				expectedRoots: ['s1'],
				expectedLeftOut: {
					s1: false,
					e1: false,
					q01: false,
					prot: false,
					ptrc1: false,
					ctrl: true,
				},
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const section = await readProcessSection(source.query)
			const satellites = await readSatelliteIndex(source.query)
			const plan = planProcessFrames({
				index: indexProcessSection(section),
				satellites,
				lnodes: new Set(testCase.lnodes),
				iedUuids: new Set(),
				options: {},
			})
			const leftOut = Object.fromEntries(
				Object.keys(testCase.expectedLeftOut).map((name) => [name, plan.leaveOut.has(name)]),
			)
			expect({ roots: plan.roots.map((root) => root.id), leftOut }).toEqual({
				roots: testCase.expectedRoots,
				leftOut: testCase.expectedLeftOut,
			})
		},
	})
})
