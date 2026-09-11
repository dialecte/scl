import { cloneTopologyContent } from './clone-topology-content'

import { describe } from 'vitest'

import { ensureSubstationTemplateStructure } from '@/v2019C1/extensions/lifecycle/extract/transaction/ensure-substation-structure'
import { applyUuidRemap } from '@/v2019C1/extensions/reference/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const bayRef = { tagName: 'Bay', id: 'bay-1' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

// A project Bay carries an Application whose composed Function lives under the Substation.
// cloneTopologyContent must gather BOTH (consume the application layer) into a self-contained
// target: the Application under the Bay, its composed Function under the Substation, and the
// Function's type closure.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="scl-src">
		<Substation name="S1" ${id}="sub-1">
			<VoltageLevel name="V1" ${id}="vl-1">
				<Bay name="B1" ${id}="bay-1">
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

// A Bay carries equipment and a ConnectivityNode (topology connectivity referenced by equipment
// Terminals). Both are the topology layer's own content and must be gathered.
const connectivitySourceXml = /* xml */ `
	<SCL ${ns} ${id}="scl-src3">
		<Substation name="S1" ${id}="sub-1">
			<VoltageLevel name="V1" ${id}="vl-1">
				<Bay name="B1" ${id}="bay-1">
					<ConductingEquipment name="QA1" type="CBR" ${id}="ce-1">
						<Terminal name="T1" connectivityNode="S1/V1/B1/CN1" cNodeName="CN1" ${id}="term-1"/>
					</ConductingEquipment>
					<ConnectivityNode name="CN1" pathName="S1/V1/B1/CN1" ${id}="cn-1"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>`

// A Bay carries its own equipment and a standalone Function (not reached through any Application).
// Both are the topology layer's own content and must be gathered.
const equipmentSourceXml = /* xml */ `
	<SCL ${ns} ${id}="scl-src2">
		<Substation name="S1" ${id}="sub-1">
			<VoltageLevel name="V1" ${id}="vl-1">
				<Bay name="B1" ${id}="bay-1">
					<ConductingEquipment name="QA1" type="CBR" ${id}="ce-1"/>
					<Function name="Interlock" uuid="fn-il-uuid" ${id}="fn-il">
						<LNode iedName="None" lnClass="CILO" lnInst="1" lnType="CILO_Type" uuid="ln-il-uuid" ${id}="lnode-il"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt-2">
			<LNodeType id="CILO_Type" lnClass="CILO" ${id}="lnt-2">
				<DO name="EnaOpn" type="SPS_Type" ${id}="do-2"/>
			</LNodeType>
			<DOType id="SPS_Type" cdc="SPS" ${id}="dot-2">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-2"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>`

describe('cloneTopologyContent - composes the application layer into a self-contained topology', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		"a Bay's Application and its composed Function are both gathered into the target structure": {
			sourceXml,
			targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
			expectedQueries: [
				// the Application is cloned under the (TEMPLATE) Bay
				'//default:Bay//v2019C1:Application[@name="CB"]',
				// its composed Function is gathered under the Substation (the layer was consumed)
				'//default:Substation/default:Function[@name="Prot"]',
				// the Function's type closure travelled with it
				'//default:DataTypeTemplates/default:LNodeType[@id="CSWI_Type"]',
				'//default:DataTypeTemplates/default:DOType[@id="DPC_Type"]',
			],
		},

		'equipment and a standalone Function under the Bay are gathered': {
			sourceXml: equipmentSourceXml,
			targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
			expectedQueries: [
				// the Bay's own equipment travels (topology content)
				'//default:Bay/default:ConductingEquipment[@name="QA1"]',
				// a standalone Function under the Bay is gathered at its structural level
				'//default:Bay/default:Function[@name="Interlock"]',
				// its type closure travelled too
				'//default:DataTypeTemplates/default:LNodeType[@id="CILO_Type"]',
			],
		},

		'a ConnectivityNode under the Bay is carried alongside equipment': {
			sourceXml: connectivitySourceXml,
			targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
			expectedQueries: [
				// equipment travels with its nested Terminal
				'//default:Bay/default:ConductingEquipment[@name="QA1"]/default:Terminal[@cNodeName="CN1"]',
				// the ConnectivityNode the Terminal points at must travel too
				'//default:Bay/default:ConnectivityNode[@name="CN1"]',
			],
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			const structure = await ensureSubstationTemplateStructure(tx)
			const mappings = await cloneTopologyContent(tx, {
				sourceQuery: source.query,
				scopeRef: bayRef,
				structure,
				omit: ['FunctionSclRef', 'ApplicationSclRef'],
			})
			await applyUuidRemap(tx, { mappings })
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
