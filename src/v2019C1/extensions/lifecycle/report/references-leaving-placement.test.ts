import { describe, expect } from 'vitest'

import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { ReportWarning } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const lifecycleTarget = {
	verb: 'ssd' as const,
	scenario: 'instantiate' as const,
	ref: { tagName: 'Substation', id: 'substation-s' } as Scl.Ref<'Substation'>,
	anchor: { tagName: 'VoltageLevel', id: 'voltage-level-t' } as Scl.Ref<'VoltageLevel'>,
}

/** The reference left out is listed among the report's warnings: what it was, where it pointed. */
describe('report - a reference of the placed content naming what the template does not hold', () => {
	type WarningTestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		expectedWarnings: ReportWarning[]
	}

	const testCases: SclTest.TestCases<WarningTestCase> = {
		'a breaker terminal on a node of a bay the template does not hold → warned, with its attribute and path':
			{
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="ssd">
					<Header id="ssd-header" uuid="ssd-document-uuid" version="0" revision="1" ${id}="header-s"/>
					<Substation name="TEMPLATE" ${id}="substation-s">
						<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
							<Bay name="Bay_MV" ${id}="bay-s">
								<ConductingEquipment name="CBR1" type="CBR" ${id}="breaker-s">
									<!-- Bay_HV is not in the template: this path names nothing it holds -->
									<Terminal name="T1" connectivityNode="TEMPLATE/TEMPLATE/Bay_HV/L2" substationName="TEMPLATE" voltageLevelName="TEMPLATE" bayName="Bay_HV" cNodeName="L2" ${id}="terminal-outside-s"/>
									<Terminal name="T2" connectivityNode="TEMPLATE/TEMPLATE/Bay_MV/L1" substationName="TEMPLATE" voltageLevelName="TEMPLATE" bayName="Bay_MV" cNodeName="L1" ${id}="terminal-inside-s"/>
								</ConductingEquipment>
								<ConnectivityNode name="L1" pathName="TEMPLATE/TEMPLATE/Bay_MV/L1" ${id}="node-s"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
				targetXml: /* xml */ `
				<SCL ${ns} ${id}="scd">
					<Header id="project" uuid="project-uuid" ${id}="header-t"/>
					<Substation name="S1" ${id}="substation-t">
						<VoltageLevel name="15kV" ${id}="voltage-level-t"/>
					</Substation>
				</SCL>
			`,
				expectedWarnings: [
					{
						code: 'reference-not-placed',
						reference: { tagName: 'Terminal', id: 'terminal-outside-s' },
						attribute: 'connectivityNode',
						path: 'TEMPLATE/TEMPLATE/Bay_HV/L2',
					},
				],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<WarningTestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		const reported = await report(target.query, { ...lifecycleTarget, sourceQuery: source.query })
		expect(reported.warnings).toEqual(testCase.expectedWarnings)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
