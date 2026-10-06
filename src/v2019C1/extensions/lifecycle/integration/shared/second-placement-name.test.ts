import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { asd as instantiateAsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

// The name of an element placed a second time: the report carries the template's, apply writes the
// next free one, and the report's node leads to the element written - where a consumer reads the
// name the project ends with.

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
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="app-fref-s"/>
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
	</SCL>
`

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** How many instances the project holds already. */
	placedBefore: number
	expected: {
		/** The name apply writes, read at the element the report's Application node leads to. */
		applied: string
	}
}

describe('lifecycle — the name an application is placed under', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'placed for the first time → its own name': {
			sourceXml,
			targetXml,
			placedBefore: 0,
			expected: { applied: 'HMI' },
		},
		'placed again beside the first → the next free name, read where the report leads': {
			sourceXml,
			targetXml,
			placedBefore: 1,
			expected: { applied: 'HMI_1' },
		},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		for (let placed = 0; placed < testCase.placedBefore; placed++) {
			await target.transaction(async (tx) => {
				await instantiateAsd(tx, {
					sourceQuery: source.query,
					applicationRef,
					targetParent: bayRef,
				})
			})
		}

		const lifecycleTarget = {
			verb: 'asd' as const,
			scenario: 'instantiate' as const,
			sourceQuery: source.query,
			ref: applicationRef,
			anchor: bayRef,
		}
		const lifecycleReport = await report(target.query, lifecycleTarget)
		await target.transaction(async (tx) => {
			await apply(tx, {
				...lifecycleTarget,
				report: lifecycleReport,
				resolution: { decisions: new Map() },
			})
		})

		// the report carries what the template asks for; what is written is read where it leads
		const node = allGroups(lifecycleReport).find(
			(group) => group.primary.tagName === 'Application',
		)?.primary
		const appliedName = node?.appliedRef
			? await target.query.getAttribute(node.appliedRef as Scl.Ref<'Application'>, { name: 'name' })
			: undefined
		expect(appliedName, 'apply').toBe(testCase.expected.applied)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
