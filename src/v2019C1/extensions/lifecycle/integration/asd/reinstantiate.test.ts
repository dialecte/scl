import { apply } from '../apply'
import { report } from '../report'

import { describe } from 'vitest'

import { asd as instantiateAsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

// `scenario` split: re-applying an already-instantiated ASD.
//  - `instantiate` -> place ANOTHER instance (name collision auto-resolved, e.g. HMI_1);
//  - `update` (default) -> reconcile the existing instance (idempotent no-op here).
// This proves instantiate and update are distinct operations chosen explicitly.

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
}

describe('lifecycle scenario — re-apply an ASD (instantiate vs update)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'instantiate places ANOTHER instance with an auto-resolved name': {
			sourceXml,
			targetXml,
			scenario: 'instantiate',
			expectedQueries: [
				'//v2019C1:Application[@name="HMI"]', // the first instance is untouched
				'//v2019C1:Application[@name="HMI_1"]', // the re-instantiation is a new, renamed instance
				'//default:Bay/default:Function[@name="Prot"]', // first composed function
				'//default:Bay/default:Function[@name="Prot_1"]', // its new instance
			],
			unexpectedQueries: [
				'//v2019C1:Application[@name="HMI_2"]', // exactly one extra instance
			],
		},
		'update reconciles the existing instance (no duplicate)': {
			sourceXml,
			targetXml,
			scenario: 'update',
			expectedQueries: [
				'//v2019C1:Application[@name="HMI"]', // reconciled in place
				'//default:Bay/default:Function[@name="Prot"]',
			],
			unexpectedQueries: [
				'//v2019C1:Application[@name="HMI_1"]', // update never duplicates
				'//default:Bay/default:Function[@name="Prot_1"]',
			],
		},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		// seed: one existing instance (a normal first-time instantiation)
		await target.transaction(async (tx) => {
			await instantiateAsd(tx, { sourceQuery: source.query, applicationRef, targetParent: bayRef })
		})

		// re-apply the SAME template through the seam with the chosen scenario
		const rep = await report(target.query, {
			verb: 'asd',
			scenario: testCase.scenario,
			sourceQuery: source.query,
			ref: applicationRef,
			anchor: bayRef,
		})
		await target.transaction(async (tx) => {
			await apply(tx, {
				verb: 'asd',
				scenario: testCase.scenario,
				sourceQuery: source.query,
				ref: applicationRef,
				anchor: bayRef,
				report: rep,
				decisions: new Map(),
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
