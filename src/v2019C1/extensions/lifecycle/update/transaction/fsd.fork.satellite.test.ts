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

// FSD rev2 (source): the carried FunctionCategory satellite's `desc` is bumped. Same uuids.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd-v2">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" desc="rev2 category" uuid="cat-src-uuid" ${id}="cat-s">
					<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="catref-s"/>
				</eIEC61850-6-100:FunctionCategory>
				<eIEC61850-6-100:FunctionCategory name="PROTECTION" desc="added in rev2" uuid="cat2-src-uuid" ${id}="cat2-s">
					<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="catref2-s"/>
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
	</SCL>`

// FSD rev1 (target): identical uuids, no templateUuid, FunctionCategory `desc="rev1 category"`.
const targetXml = /* xml */ `
	<SCL ${ns} ${id}="fsd-v1">
		<Substation name="TEMPLATE" ${id}="sub-t">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-t">
				<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" desc="rev1 category" uuid="cat-src-uuid" ${id}="cat-t">
					<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="catref-t"/>
				</eIEC61850-6-100:FunctionCategory>
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

describe('update.fsd — fork reconciles a carried satellite (FunctionCategory) keeping identity', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the FunctionCategory is reconciled in place by uuid + a new one is added keeping identity': {
			sourceXml,
			targetXml,
			expectedQueries: [
				// reconciled in place on the same-uuid satellite; desc updated, uuid preserved
				'//v2019C1:FunctionCategory[@uuid="cat-src-uuid"][@desc="rev2 category"]',
				// the satellite ADDED by rev2 keeps its source uuid (fork converges identity)
				'//v2019C1:FunctionCategory[@name="PROTECTION"][@uuid="cat2-src-uuid"]',
			],
			unexpectedQueries: [
				// fork keeps identity: no templateUuid stamped on either satellite
				'//v2019C1:FunctionCategory[@templateUuid]',
				// no stale value, no duplicate stamped satellite
				'//v2019C1:FunctionCategory[@desc="rev1 category"]',
				'//v2019C1:FunctionCategory[@templateUuid="cat2-src-uuid"]',
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
