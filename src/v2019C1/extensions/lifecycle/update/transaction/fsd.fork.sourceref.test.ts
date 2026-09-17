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

// FSD revision 2 (source): adds a whole new SubFunction whose SourceRef binds — by
// `sourceLNodeUuid` — to a sibling LNode ADDED in the SAME revision. Both the SourceRef
// and its target LNode are new, so a fork must keep them coherent (the ref must still
// point at the added LNode's preserved source uuid).
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd-v2">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1" uuid="lnode-src-uuid"/>
						<SubFunction name="Sub" ${id}="sub-1" uuid="sub-new-uuid">
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
	</SCL>
`

// FSD revision 1 (target): the prior revision — the Function only, no SubFunction. Same
// element uuids where shared, no templateUuid (a pure template file).
const targetXml = /* xml */ `
	<SCL ${ns} ${id}="fsd-v1">
		<Substation name="TEMPLATE" ${id}="sub-t">
			<VoltageLevel name="TEMPLATE" ${id}="vl-t">
				<Bay name="TEMPLATE" ${id}="bay-t">
					<Function name="Prot" ${id}="fn-t" uuid="fn-src-uuid">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-t" uuid="lnode-src-uuid"/>
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
	</SCL>
`

describe('update.fsd — fork adds a SourceRef bound to a newly-added LNode (identity coherence)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the added SourceRef still points at the added LNode by its preserved source uuid': {
			sourceXml,
			targetXml,
			expectedQueries: [
				// the added target LNode keeps its source uuid
				'//default:SubFunction[@uuid="sub-new-uuid"]/default:LNode[@lnClass="PTRC"][@uuid="lnode-a-uuid"]',
				// the added SourceRef's uuid ref resolves to that same preserved uuid (coherent)
				'//v2019C1:SourceRef[@sourceLNodeUuid="lnode-a-uuid"]',
			],
			unexpectedQueries: [
				// fork keeps identity — the added SourceRef carries no templateUuid
				'//v2019C1:SourceRef[@templateUuid]',
				// the ref was not left pointing at some other (fresh) uuid
				'//v2019C1:SourceRef[@sourceLNodeUuid][not(@sourceLNodeUuid="lnode-a-uuid")]',
			],
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await updateFsd(tx, {
				sourceQuery: source.query,
				functionRef,
				targetParent: targetBayRef,
				scenario: 'fork',
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
