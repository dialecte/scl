import { asd as updateAsd } from './asd'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const applicationRef = { tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>
const targetBayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

// ASD revision 2 (source): SAME element uuids as rev1, the Application `type` and the
// composed Function `desc` both bumped.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd-v2">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:Application name="HMI" type="DCS2" uuid="app-src-uuid" ${id}="app-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="frc-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="app-fref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" desc="rev2" ${id}="fn-1" uuid="fn-src-uuid">
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

// ASD revision 1 (target): the prior revision of the SAME file — identical uuids, no
// templateUuid, Application `type="DCS"`, Function `desc="rev1"`.
const targetXml = /* xml */ `
	<SCL ${ns} ${id}="asd-v1">
		<Substation name="TEMPLATE" ${id}="sub-t">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-t">
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="app-src-uuid" ${id}="app-t">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-t">
						<eIEC61850-6-100:FunctionRoleContent ${id}="frc-t">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="app-fref-t"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-t">
				<Bay name="TEMPLATE" ${id}="bay-t">
					<Function name="Prot" desc="rev1" ${id}="fn-t" uuid="fn-src-uuid">
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

describe('update.asd — fork (same-file revision, keep identity, both layers)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'fork reconciles the Application and its composed Function in place, keeping identity': {
			sourceXml,
			targetXml,
			expectedQueries: [
				// application layer: updated in place, uuid preserved
				'//v2019C1:Application[@name="HMI"][@uuid="app-src-uuid"][@type="DCS2"]',
				// function-layer cascade under fork: updated in place, uuid preserved
				'//default:Function[@name="Prot"][@uuid="fn-src-uuid"][@desc="rev2"]',
			],
			unexpectedQueries: [
				// fork keeps identity: no templateUuid stamped on either layer
				'//v2019C1:Application[@uuid="app-src-uuid"][@templateUuid]',
				'//default:Function[@uuid="fn-src-uuid"][@templateUuid]',
				// no stale values, no duplicates
				'//v2019C1:Application[@type="DCS"]',
				'//default:Function[@name="Prot"][@desc="rev1"]',
				'//v2019C1:Application[@templateUuid="app-src-uuid"]',
			],
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await updateAsd(tx, {
				sourceQuery: source.query,
				applicationRef,
				targetParent: targetBayRef,
				scenario: 'fork',
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
