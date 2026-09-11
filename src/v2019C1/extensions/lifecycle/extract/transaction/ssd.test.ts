import { ssd } from './ssd'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const scopeRef = { tagName: 'Bay', id: 'bay-1' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

// Extract a bay-typical from a project: the produced SSD has an SSD Header, a TEMPLATE process
// structure, and - by consuming the application layer - the Bay's Application plus its composed
// Function and type closure, self-contained.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="scl-src">
		<Substation name="S1" ${id}="sub-1">
			<VoltageLevel name="V1" ${id}="vl-1">
				<Bay name="B1" templateUuid="bay-tmpl-uuid" ${id}="bay-1">
					<Private type="eIEC61850-6-100" ${id}="bay-priv">
						<eIEC61850-6-100:Application name="CB" type="HV" uuid="app-src-uuid" ${id}="app-1">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-1">
								<eIEC61850-6-100:FunctionRoleContent roleInst="1" ${id}="frc-1">
									<eIEC61850-6-100:FunctionRef function="S1/Prot" functionUuid="fn-src-uuid" ${id}="app-fref-1"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
					</Private>
				</Bay>
			</VoltageLevel>
			<Function name="Prot" uuid="fn-src-uuid" ${id}="fn-1">
				<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="ln-src-uuid" ${id}="lnode-1"/>
			</Function>
		</Substation>
		<DataTypeTemplates ${id}="dtt-1">
			<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-1">
				<DO name="Pos" type="DPC_Type" ${id}="do-1"/>
			</LNodeType>
			<DOType id="DPC_Type" cdc="DPC" ${id}="dot-1">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-1"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>`

describe('extract.ssd', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'extracts a bay-typical into a self-contained SSD (SSD Header + TEMPLATE structure + gathered app/function)':
			{
				sourceXml,
				targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
				expectedQueries: [
					'//default:Header[@fileType="SSD"]',
					// ancestors stay TEMPLATE; the selected entrypoint is the named, reusable root
					'//default:Substation[@name="TEMPLATE"]',
					'//default:VoltageLevel[@name="TEMPLATE"]',
					'//default:Bay[@name="B1"]',
					'//default:Bay//v2019C1:Application[@name="CB"]',
					'//default:Substation/default:Function[@name="Prot"]',
					'//default:DataTypeTemplates/default:LNodeType[@id="CSWI_Type"]',
				],
				unexpectedQueries: [
					// the exported root's templateUuid is stripped - a fresh, reusable template
					'//default:Bay[@templateUuid]',
				],
			},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await ssd(tx, {
				sourceQuery: source.query,
				scopeRef,
				tool: 'TEST',
				who: 'test',
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
