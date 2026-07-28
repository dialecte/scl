import { describe, expect } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { asd as instantiateAsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

// Placement-conflict classification on the report (scenario = instantiate):
//  - resolvable collision (Application name) -> the `name` editable attribute is flagged
//    with the engine's collision-free suggestedValue; no gate needed.
//  - update never flags (an identity match is the reconcile target).

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const applicationRef = { tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Header id="asd-header" uuid="asd-doc-uuid" version="3" revision="C" ${id}="hdr-s"/>
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:Application name="HMI" type="DCS" desc="v1" uuid="app-src-uuid" ${id}="app-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="frc-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="app-fref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" desc="v1" ${id}="fn-1" uuid="fn-src-uuid">
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
	scenario: LifecycleScenario
	/** expected `name` conflict on the Application group (undefined = none flagged) */
	expectedNameConflict?: { suggestedValue: string }
}

describe('lifecycle report — placement-conflict classification', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'instantiate flags a resolvable Application name collision with a suggested value': {
			sourceXml,
			targetXml,
			scenario: 'instantiate',
			expectedNameConflict: { suggestedValue: 'HMI_1' },
		},
		'update does not flag a conflict (identity match is the reconcile target)': {
			sourceXml,
			targetXml,
			scenario: 'update',
			expectedNameConflict: undefined,
		},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		// seed one existing instance so a re-application collides on the Application name
		await target.transaction(async (tx) => {
			await instantiateAsd(tx, { sourceQuery: source.query, applicationRef, targetParent: bayRef })
		})

		const rep = await report(target.query, {
			verb: 'asd',
			scenario: testCase.scenario,
			sourceQuery: source.query,
			ref: applicationRef,
			anchor: bayRef,
		})

		const appGroup = allGroups(rep).find((group) => group.primary.tagName === 'Application')
		const nameAttr = appGroup?.editableAttributes?.find((entry) => entry.attr === 'name')

		if (testCase.expectedNameConflict) {
			expect(nameAttr?.conflict).toBe(true)
			expect(nameAttr?.suggestedValue).toBe(testCase.expectedNameConflict.suggestedValue)
			expect(appGroup?.conflict).toBeUndefined() // resolvable, not identity-locked
		} else {
			expect(nameAttr?.conflict).toBeUndefined()
		}
	}

	runSclTestCases.withoutExport({ testCases, act })
})
