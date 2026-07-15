import { apply } from '../apply'
import { report } from '../report'

import { describe, expect } from 'vitest'

import { asd as instantiateAsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { GroupDecision } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

// Part C (Phase B) — several instances of one ASD template under one anchor. update/report
// enumerate every Application instance AND every composed-Function instance; the decision map
// targets a subset (accept 1 of 2 Applications, etc.). Both layers fan out.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const applicationRef = { tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>
const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
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
	mode: 'accept-all' | 'skip-all' | 'accept-except-hmi1-app'
}

describe('lifecycle scenario — multi-instance ASD update (Part C, Phase B)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'accept-all reconciles EVERY Application and composed Function to v2': {
			sourceXml,
			targetXml,
			mode: 'accept-all',
			expectedQueries: [
				'//v2019C1:Application[@name="HMI"][@desc="v2"]',
				'//v2019C1:Application[@name="HMI_1"][@desc="v2"]',
				'//default:Function[@name="Prot"][@desc="v2"]',
				'//default:Function[@name="Prot_1"][@desc="v2"]',
			],
			unexpectedQueries: ['//v2019C1:Application[@desc="v1"]', '//default:Function[@desc="v1"]'],
		},
		'skip-all leaves every instance at v1': {
			sourceXml,
			targetXml,
			mode: 'skip-all',
			expectedQueries: [
				'//v2019C1:Application[@name="HMI"][@desc="v1"]',
				'//v2019C1:Application[@name="HMI_1"][@desc="v1"]',
				'//default:Function[@name="Prot"][@desc="v1"]',
				'//default:Function[@name="Prot_1"][@desc="v1"]',
			],
			unexpectedQueries: ['//v2019C1:Application[@desc="v2"]', '//default:Function[@desc="v2"]'],
		},
		'skipping one Application instance updates just the other (targeted subset)': {
			sourceXml,
			targetXml,
			mode: 'accept-except-hmi1-app',
			expectedQueries: [
				'//v2019C1:Application[@name="HMI"][@desc="v2"]', // accepted app instance updated
				'//v2019C1:Application[@name="HMI_1"][@desc="v1"]', // skipped app instance untouched
				'//default:Function[@name="Prot"][@desc="v2"]', // functions accepted -> both updated
				'//default:Function[@name="Prot_1"][@desc="v2"]',
			],
			unexpectedQueries: ['//v2019C1:Application[@name="HMI_1"][@desc="v2"]'],
		},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		// instantiate the ASD twice under B1 — the second Application/Function are
		// auto-renamed (HMI_1 / Prot_1) by collision resolution
		await target.transaction(async (tx) => {
			await instantiateAsd(tx, { sourceQuery: source.query, applicationRef, targetParent: bayRef })
		})
		await target.transaction(async (tx) => {
			await instantiateAsd(tx, { sourceQuery: source.query, applicationRef, targetParent: bayRef })
		})

		// the template evolves on both layers
		await source.transaction(async (tx) => {
			await tx.update(applicationRef, { attributes: { desc: 'v2' } })
			await tx.update(functionRef, { attributes: { desc: 'v2' } })
		})

		const rep = await report(target.query, {
			verb: 'asd',
			sourceQuery: source.query,
			ref: applicationRef,
			anchor: bayRef,
		})

		// each group is self-describing: its instance is labelled for the UI, on both layers
		const titles = new Set(rep.groups.map((group) => group.instanceScopeTitle))
		expect(titles.has('HMI')).toBe(true)
		expect(titles.has('HMI_1')).toBe(true)
		expect(titles.has('Prot')).toBe(true)
		expect(titles.has('Prot_1')).toBe(true)

		const decisions = new Map<string, GroupDecision>()
		if (testCase.mode === 'skip-all') {
			for (const group of rep.groups) decisions.set(group.id, 'skip')
		} else if (testCase.mode === 'accept-except-hmi1-app') {
			const [hmi1] = await target.query.findByAttributes({
				tagName: 'Application',
				attributes: { name: 'HMI_1' },
			})
			for (const group of rep.groups) {
				if (group.instanceScopeId === hmi1?.id) decisions.set(group.id, 'skip')
			}
		}
		// accept-all -> empty map

		await target.transaction(async (tx) => {
			await apply(tx, {
				verb: 'asd',
				sourceQuery: source.query,
				ref: applicationRef,
				anchor: bayRef,
				report: rep,
				decisions,
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
