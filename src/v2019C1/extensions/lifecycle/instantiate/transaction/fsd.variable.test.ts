import { fsd as instantiateFsd } from './fsd'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

// A Function annotated by an external Variable (Substation-level, `VariableApplyTo`
// points at the function) — a function-layer satellite like FunctionCategory.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:Variable name="VXCBR" uuid="var-src-uuid" ${id}="var-s">
					<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/Prot" elementUuid="fn-src-uuid" ${id}="vapp-s"/>
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

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>`

describe('instantiate.fsd — carried Variable satellite', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'clones the external Variable that applies to the function and stamps its lineage': {
			sourceXml,
			targetXml,
			expectedQueries: [
				'//v2019C1:Variable[@name="VXCBR"][@templateUuid="var-src-uuid"]',
				'//v2019C1:Variable/v2019C1:VariableApplyTo',
			],
			unexpectedQueries: [
				// the instance receives a fresh uuid; the source uuid survives only as templateUuid
				'//v2019C1:Variable[@uuid="var-src-uuid"]',
			],
		},

		'applies to the existing same-name Variable without duplicating it': {
			sourceXml,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="scd">
					<Substation name="S1" ${id}="sub-t">
						<Private type="eIEC61850-6-100" ${id}="priv-t">
							<eIEC61850-6-100:Variable name="VXCBR" uuid="existing-var-uuid" ${id}="var-t"/>
						</Private>
						<VoltageLevel name="V1" ${id}="vl-t">
							<Bay name="B1" ${id}="bay-t"/>
						</VoltageLevel>
					</Substation>
				</SCL>`,
			expectedQueries: [
				// the instance function's application lands on the pre-existing Variable
				'//v2019C1:Variable[@uuid="existing-var-uuid"]/v2019C1:VariableApplyTo',
			],
			unexpectedQueries: [
				// no second same-name Variable is created
				'//v2019C1:Variable[@name="VXCBR"][2]',
				'//v2019C1:Variable[@uuid="var-src-uuid"]',
			],
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async (tx) => {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
