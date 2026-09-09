import { fsd as updateFsd } from './fsd'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const targetBayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

// Template revision that ADDS a SubFunction whose SourceRef binds — by `sourceLNodeUuid` —
// to a sibling LNode also in that new subtree. On a TEMPLATE update the added elements get
// fresh instance uuids, so the ref must be repointed onto the added LNode's fresh uuid.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1" uuid="lnode-src-uuid"/>
						<SubFunction name="Sub" ${id}="sub-1" uuid="sub-src-uuid">
							<LNode iedName="None" lnClass="PTRC" lnInst="1" lnType="CSWI_Type" ${id}="lnode-a" uuid="lnode-a-uuid"/>
							<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="CSWI_Type" ${id}="lnode-b" uuid="lnode-b-uuid">
								<Private type="eIEC61850-6-100" ${id}="lnode-b-priv">
									<eIEC61850-6-100:LNodeInputs ${id}="inputs">
										<eIEC61850-6-100:SourceRef input="Trip" source="TEMPLATE/Prot/Sub/PTRC1" sourceLNodeUuid="lnode-a-uuid" sourceDoName="Tr" sourceDaName="general" uuid="sref-uuid" ${id}="sref"/>
									</eIEC61850-6-100:LNodeInputs>
								</Private>
							</LNode>
						</SubFunction>
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
	</SCL>`

// The project already holds an instance of the Function (a prior instantiation of an
// earlier revision, matched by `templateUuid`) but not yet the SubFunction the template
// now adds.
const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t">
					<Function name="Prot" ${id}="fn-t" uuid="inst-fn-uuid" templateUuid="fn-src-uuid">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-ti" uuid="inst-lnode-uuid" templateUuid="lnode-src-uuid"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt-t">
			<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-t">
				<DO name="Pos" type="DPC_Type" ${id}="do-t"/>
			</LNodeType>
			<DOType id="DPC_Type" cdc="DPC" ${id}="dot-t">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-t"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>`

describe('update.fsd — template add repoints an internal ref to the fresh instance uuid', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the added SourceRef is remapped to the added LNode fresh uuid, not left at the source uuid': {
			sourceXml,
			targetXml,
			expectedQueries: [
				// the added target LNode is stamped with its source lineage + a fresh uuid
				'//default:SubFunction/default:LNode[@lnClass="PTRC"][@templateUuid="lnode-a-uuid"]',
				// the added SourceRef points at that added LNode's FRESH uuid (coherent)
				'//v2019C1:SourceRef[@sourceLNodeUuid = //default:LNode[@templateUuid="lnode-a-uuid"]/@uuid]',
			],
			unexpectedQueries: [
				// the ref must NOT be left dangling at the source uuid
				'//v2019C1:SourceRef[@sourceLNodeUuid="lnode-a-uuid"]',
			],
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await updateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: targetBayRef })
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
