import { deep } from './deep'

import { describe } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & {
	ref: { tagName: string; id: string }
	targetParent: { tagName: string; id: string }
}

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('import.deep', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'imports a Function subtree and its type closure into the target parent': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<Substation name="S1" ${id}="sub-1">
					<VoltageLevel name="V1" ${id}="vl-1">
						<Bay name="B1" ${id}="bay-1">
							<Function name="Prot" ${id}="fn-1">
								<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1"/>
							</Function>
						</Bay>
					</VoltageLevel>
				</Substation>
				<DataTypeTemplates ${id}="dtt-1">
					<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-1">
						<DO name="Pos" type="DPC_Type" ${id}="do-1"/>
					</LNodeType>
					<DOType id="DPC_Type" cdc="DPC" ${id}="dot-1">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-1"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			targetXml: /* xml */ `
			<SCL ${ns} ${id}="scl-t">
				<Substation name="S1" ${id}="sub-t">
					<VoltageLevel name="V1" ${id}="vl-t">
						<!-- empty bay, awaiting the imported Function: -->
						<Bay name="B1" ${id}="bay-t"/>
					</VoltageLevel>
				</Substation>
			</SCL>`,
			ref: { tagName: 'Function', id: 'fn-1' },
			targetParent: { tagName: 'Bay', id: 'bay-t' },
			expectedQueries: [
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"]/default:LNode[@lnClass="CSWI"]',
				'//default:DataTypeTemplates/default:LNodeType[@id="CSWI_Type"]/default:DO[@name="Pos"]',
				'//default:DataTypeTemplates/default:DOType[@id="DPC_Type"]/default:DA[@name="stVal"]',
			],
		},
		'imports an Application and creates its missing uuid-referenced satellite': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<Substation name="TEMPLATE" ${id}="sub-1" uuid="sub-uuid">
					<Private ${id}="priv-1" type="eIEC61850-6-100">
						<eIEC61850-6-100:AllocationRole ${id}="ar-1" name="HMI_PC" uuid="ar-uuid"/>
						<eIEC61850-6-100:Application ${id}="app-1" name="HMI" type="DCS" uuid="app-uuid">
							<eIEC61850-6-100:AllocationRoleRef ${id}="arref-1" allocationRole="TEMPLATE/HMI_PC" allocationRoleUuid="ar-uuid"/>
						</eIEC61850-6-100:Application>
					</Private>
				</Substation>
			</SCL>`,
			targetXml: /* xml */ `
			<SCL ${ns} ${id}="scl-t">
				<Substation name="TEMPLATE" ${id}="sub-t" uuid="sub-t-uuid">
					<Private ${id}="priv-t" type="eIEC61850-6-100"/>
				</Substation>
			</SCL>`,
			ref: { tagName: 'Application', id: 'app-1' },
			targetParent: { tagName: 'Private', id: 'priv-t' },
			expectedQueries: [
				'//v2019C1:Application[@name="HMI"]',
				'//v2019C1:AllocationRole[@name="HMI_PC"]',
			],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await deep(tx, {
				sourceQuery: source.query,
				ref: testCase.ref as Scl.Ref<Scl.ElementsOf>,
				targetParent: testCase.targetParent as Scl.Ref<Scl.ElementsOf>,
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
