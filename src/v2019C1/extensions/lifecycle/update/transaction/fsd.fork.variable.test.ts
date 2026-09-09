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

// FSD rev2 (source): the cross-cutting Variable applying to the LNode is updated, and a
// second one is ADDED. Same uuids where shared.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd-v2">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:Variable name="Prefix" value="DVNAME" desc="rev2 prefix" uuid="var-src-uuid" ${id}="var-s">
					<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/Prot/CSWI1" elementUuid="lnode-src-uuid" ${id}="vat-s"/>
				</eIEC61850-6-100:Variable>
				<eIEC61850-6-100:Variable name="Suffix" value="X" desc="added in rev2" uuid="var2-src-uuid" ${id}="var2-s">
					<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/Prot/CSWI1" elementUuid="lnode-src-uuid" ${id}="vat2-s"/>
				</eIEC61850-6-100:Variable>
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
	</SCL>`

// FSD rev1 (target): only the Prefix Variable, identical uuids, no templateUuid.
const targetXml = /* xml */ `
	<SCL ${ns} ${id}="fsd-v1">
		<Substation name="TEMPLATE" ${id}="sub-t">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-t">
				<eIEC61850-6-100:Variable name="Prefix" value="DVNAME" desc="rev1 prefix" uuid="var-src-uuid" ${id}="var-t">
					<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/Prot/CSWI1" elementUuid="lnode-src-uuid" ${id}="vat-t"/>
				</eIEC61850-6-100:Variable>
			</Private>
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
	</SCL>`

describe('update.fsd — fork carries the cross-cutting Variable satellite keeping identity', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the Variable is reconciled in place by uuid + a new one is added keeping identity': {
			sourceXml,
			targetXml,
			expectedQueries: [
				// reconciled in place, uuid preserved
				'//v2019C1:Variable[@name="Prefix"][@uuid="var-src-uuid"][@desc="rev2 prefix"]',
				// the added Variable keeps its source uuid
				'//v2019C1:Variable[@name="Suffix"][@uuid="var2-src-uuid"]',
			],
			unexpectedQueries: [
				// fork keeps identity: no templateUuid stamped on any Variable
				'//v2019C1:Variable[@templateUuid]',
				'//v2019C1:Variable[@desc="rev1 prefix"]',
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
