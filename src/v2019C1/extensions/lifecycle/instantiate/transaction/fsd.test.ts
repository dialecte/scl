import { fsd } from './fsd'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	functionId: string
	targetParentId: string
	targetParentTag?: Scl.ElementsOf
}

describe('instantiate.fsd', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'clones the FSD function + type closure and stamps template lineage': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="fsd">
					<Substation name="TEMPLATE" ${id}="sub-s">
						<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
							<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="cat-src-uuid" ${id}="cat-s">
								<eIEC61850-6-100:FunctionCatRef functionUuid="fn-src-uuid" function="TEMPLATE/Prot" ${id}="catref-s"/>
							</eIEC61850-6-100:FunctionCategory>
						</Private>
						<VoltageLevel name="TEMPLATE" ${id}="vl-s">
							<Bay name="TEMPLATE" ${id}="bay-s">
								<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
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
			functionId: 'fn-1',
			targetParentId: 'bay-t',
			expectedQueries: [
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"][@templateUuid="fn-src-uuid"]',
				'//default:Bay[@name="B1"]/default:Function/default:LNode[@templateUuid="lnode-src-uuid"]',
				'//default:DataTypeTemplates/default:LNodeType[@id="CSWI_Type"]/default:DO[@name="Pos"]',
				'//v2019C1:FunctionCategory[@name="MEASUREMENT"][@templateUuid="cat-src-uuid"]',
				'//v2019C1:FunctionCategory/v2019C1:FunctionCatRef[@functionUuid]',
			],
			unexpectedQueries: [
				// the instance receives a fresh uuid; the source uuid survives only as templateUuid
				'//default:Function[@uuid="fn-src-uuid"]',
				'//default:LNode[@uuid="lnode-src-uuid"]',
				// the cloned FunctionCatRef is remapped to the instance function's uuid
				'//v2019C1:FunctionCatRef[@functionUuid="fn-src-uuid"]',
			],
		},
		'instantiates a function that carries no FunctionCategory classification': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="fsd">
					<Substation name="TEMPLATE" ${id}="sub-s">
						<VoltageLevel name="TEMPLATE" ${id}="vl-s">
							<Bay name="TEMPLATE" ${id}="bay-s">
								<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
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
			functionId: 'fn-1',
			targetParentId: 'bay-t',
			expectedQueries: [
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"][@templateUuid="fn-src-uuid"]',
				'//default:Bay[@name="B1"]/default:Function/default:LNode[@templateUuid="lnode-src-uuid"]',
				'//default:DataTypeTemplates/default:LNodeType[@id="CSWI_Type"]/default:DO[@name="Pos"]',
			],
			unexpectedQueries: [
				'//default:Function[@uuid="fn-src-uuid"]',
				'//default:LNode[@uuid="lnode-src-uuid"]',
				// no classification exists in the FSD, so none is instantiated
				'//v2019C1:FunctionCategory',
			],
		},
		'instantiates directly under a Substation (parent is not a Bay)': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="fsd">
					<Substation name="TEMPLATE" ${id}="sub-s">
						<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
							<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="cat-src-uuid" ${id}="cat-s">
								<eIEC61850-6-100:FunctionCatRef functionUuid="fn-src-uuid" function="TEMPLATE/Prot" ${id}="catref-s"/>
							</eIEC61850-6-100:FunctionCategory>
						</Private>
						<VoltageLevel name="TEMPLATE" ${id}="vl-s">
							<Bay name="TEMPLATE" ${id}="bay-s">
								<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
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
					<Substation name="S1" ${id}="sub-t"/>
				</SCL>`,
			functionId: 'fn-1',
			targetParentId: 'sub-t',
			targetParentTag: 'Substation',
			expectedQueries: [
				// the function is instantiated directly under the target Substation
				'//default:Substation[@name="S1"]/default:Function[@name="Prot"][@templateUuid="fn-src-uuid"]',
				// the Substation-level classification lands under the same Substation
				'//default:Substation[@name="S1"]//v2019C1:FunctionCategory[@name="MEASUREMENT"][@templateUuid="cat-src-uuid"]',
			],
			unexpectedQueries: ['//default:Function[@uuid="fn-src-uuid"]'],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await fsd(tx, {
				sourceQuery: source.query,
				functionRef: { tagName: 'Function', id: testCase.functionId } as Scl.Ref<'Function'>,
				targetParent: {
					tagName: testCase.targetParentTag ?? 'Bay',
					id: testCase.targetParentId,
				} as Scl.Ref<Scl.ElementsOf>,
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
