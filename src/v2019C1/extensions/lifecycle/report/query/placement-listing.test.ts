import { createPlacementListing } from './placement-listing'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// A function holding a variable at its own level and a behaviour description in its logical node; a variable of the bay.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="template">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-private-s">
						<eIEC61850-6-100:Variable name="VBAY" uuid="vbay-uuid" ${id}="vbay">
							<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/F1" elementUuid="f1-uuid" ${id}="vbay-apply"/>
						</eIEC61850-6-100:Variable>
					</Private>
					<Function name="F1" uuid="f1-uuid" ${id}="f1">
						<Private type="eIEC61850-6-100" ${id}="f1-private">
							<eIEC61850-6-100:Variable name="VF1" uuid="vf1-uuid" ${id}="vf1">
								<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/F1" elementUuid="f1-uuid" ${id}="vf1-apply"/>
							</eIEC61850-6-100:Variable>
						</Private>
						<LNode iedName="None" lnClass="CSWI" lnInst="1" uuid="lnode-uuid" ${id}="lnode">
							<Private type="eIEC61850-6-100" ${id}="lnode-private">
								<eIEC61850-6-100:BehaviorDescription name="BD" uuid="bd-uuid" ${id}="bd"/>
							</Private>
						</LNode>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & {
	primaryRefs: Scl.Ref<Scl.ElementsOf>[]
	/** The satellites listed already, by record id, sorted. */
	expectedSatellites: string[]
}

describe('createPlacementListing', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a function placed → what it holds, at every depth, is listed with it; what its bay holds is not':
			{
				sourceXml,
				primaryRefs: [{ tagName: 'Function', id: 'f1' } as Scl.Ref<Scl.ElementsOf>],
				expectedSatellites: ['bd', 'vf1'],
			},
		'nothing placed → nothing listed': {
			sourceXml,
			primaryRefs: [],
			expectedSatellites: [],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const listing = await createPlacementListing(source.query, {
			scope: new Set(),
			primaryRefs: testCase.primaryRefs,
			// landing on nothing the project holds
			landings: [],
		})
		expect([...listing.satellites].sort()).toEqual(testCase.expectedSatellites)
		expect([...listing.functions]).toEqual([])
	}

	runSclTestCases.withoutExport({ testCases, act })
})
