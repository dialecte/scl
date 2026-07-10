import { asd } from './asd'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	applicationId: string
	targetParentId: string
}

describe('instantiate.asd', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'clones the ASD Application + its Function + type closure and stamps instance lineage': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="asd">
					<Substation name="TEMPLATE" ${id}="sub-s">
						<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
							<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="app-src-uuid" ${id}="app-s">
								<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-s">
									<eIEC61850-6-100:FunctionRoleContent ${id}="frc-s">
										<eIEC61850-6-100:FunctionRef function="TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="app-fref-s"/>
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Private>
						<VoltageLevel name="TEMPLATE" ${id}="vl-s">
							<Bay name="TEMPLATE" ${id}="bay-s">
								<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
									<Private type="eIEC61850-6-100" ${id}="fn-priv-s">
										<eIEC61850-6-100:FunctionSclRef ${id}="fnref-s">
											<eIEC61850-6-100:SclFileReference fileType="FSD" fileName="Sub.fsd" version="1" revision="A" ${id}="fnscl-s"/>
										</eIEC61850-6-100:FunctionSclRef>
									</Private>
									<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1" uuid="lnode-src-uuid"/>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
					<DataTypeTemplates ${id}="dtt-s">
						<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-s">
							<DO name="Pos" type="DPC_Type" ${id}="do-s"/>
						</LNodeType>
						<DOType id="DPC_Type" cdc="DPC" ${id}="dot-s">
							<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-s"/>
						</DOType>
					</DataTypeTemplates>
				</SCL>`,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="scd">
					<Substation name="S1" ${id}="sub-t">
						<VoltageLevel name="V1" ${id}="vl-t">
							<Bay name="B1" ${id}="bay-t"/>
						</VoltageLevel>
					</Substation>
				</SCL>`,
			applicationId: 'app-s',
			targetParentId: 'bay-t',
			expectedQueries: [
				// the application is cloned and records its ASD counterpart as templateUuid
				'//v2019C1:Application[@name="HMI"][@templateUuid="app-src-uuid"]',
				// the composed function is cloned + stamped
				'//default:Function[@name="Prot"][@templateUuid="fn-src-uuid"]',
				'//default:Function/default:LNode[@templateUuid="lnode-src-uuid"]',
				// its type closure travels
				'//default:DataTypeTemplates/default:LNodeType[@id="CSWI_Type"]/default:DO[@name="Pos"]',
				// composition provenance (FunctionSclRef) is preserved on instantiate (not omitted)
				'//default:Function[@name="Prot"]//v2019C1:SclFileReference[@fileName="Sub.fsd"]',
			],
			unexpectedQueries: [
				// instances receive fresh uuids; source uuids survive only as templateUuid
				'//v2019C1:Application[@uuid="app-src-uuid"]',
				'//default:Function[@uuid="fn-src-uuid"]',
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
			await asd(tx, {
				sourceQuery: source.query,
				applicationRef: {
					tagName: 'Application',
					id: testCase.applicationId,
				} as Scl.Ref<'Application'>,
				targetParent: { tagName: 'Bay', id: testCase.targetParentId } as Scl.Ref<'Bay'>,
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
