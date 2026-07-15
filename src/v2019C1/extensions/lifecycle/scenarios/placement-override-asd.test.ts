import { asd as instantiateAsd } from '../instantiate/transaction'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { CollisionOverrides } from '@/v2019C1/extensions/lifecycle/engine/decide'
import type { SclTest } from '@/v2019C1/test'

// Slice 3 (ASD parity) — instantiate.asd resolves an Application name collision at its
// own structural level (Application is a Substation child: uniqueChildNameInSubstation),
// and the full track can override the name. Engine still owns uniqueness.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const applicationRef = { tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Header id="asd-header" uuid="asd-doc-uuid" version="3" revision="C" ${id}="hdr-s"/>
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

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	overrideName?: string
}

describe('lifecycle scenario — instantiate.asd resolves Application name collision (Slice 3)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a repeated instantiate auto-resolves the Application name collision': {
			sourceXml,
			targetXml,
			expectedQueries: [
				'//v2019C1:Application[@name="HMI"]', // first instance keeps the template name
				'//v2019C1:Application[@name="HMI_1"]', // collision auto-resolved
			],
			unexpectedQueries: [
				'//v2019C1:Application[@name="HMI"][2]', // no duplicate name
			],
		},
		'a user override names the second Application': {
			sourceXml,
			targetXml,
			overrideName: 'HMI_Backup',
			expectedQueries: [
				'//v2019C1:Application[@name="HMI"]', // first instance
				'//v2019C1:Application[@name="HMI_Backup"]', // user override applied verbatim
			],
			unexpectedQueries: [
				'//v2019C1:Application[@name="HMI_1"]', // not auto-resolved: user name wins
			],
		},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		// first instance takes the template name unchanged
		await target.transaction(async (tx) => {
			await instantiateAsd(tx, { sourceQuery: source.query, applicationRef, targetParent: bayRef })
		})

		// second instance carries the user's edited name (as the full track would supply it)
		const overrides: CollisionOverrides | undefined = testCase.overrideName
			? new Map([[applicationRef.id, { name: testCase.overrideName }]])
			: undefined
		await target.transaction(async (tx) => {
			await instantiateAsd(tx, {
				sourceQuery: source.query,
				applicationRef,
				targetParent: bayRef,
				overrides,
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
