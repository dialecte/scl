/// <reference types="vite/client" />
import { describe, expect } from 'vitest'

import { report } from '@/v2019C1/extensions/lifecycle/report'
import { runSclTestCases } from '@/v2019C1/test'
import { openSclDocument } from '@/v2019C1/test/open-scl-document'

import type { Scl } from '@/v2019C1/config'
import type { ReportWarning } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

/** The fixtures of the apply tests, whole documents read as they are. */
const FIXTURES: Readonly<Record<string, string>> = import.meta.glob<string>(
	'../apply/fixtures/*.xml',
	{
		query: '?raw',
		import: 'default',
		eager: true,
	},
)

/** The case's document is the project holding the placed template; the template is opened beside it. */
type UpdateTestCase = SclTest.BaseXmlTestCase & {
	templateXml: string
	expectedWarnings: ReportWarning[]
}

/** The references an update leaves out are listed among the report's warnings, as a first placement lists them. */
describe('report - an update of a bay whose terminals name what the template does not hold', () => {
	const testCases: SclTest.TestCases<UpdateTestCase> = {
		"a placed bay, its breaker and its function's breaker on nodes of a bay the template does not hold → both warned":
			{
				sourceXml: FIXTURES['../apply/fixtures/bay-with-terminals-on-a-bay-not-held-placed.xml'],
				templateXml: FIXTURES['../apply/fixtures/bay-with-terminals-on-a-bay-not-held.xml'],
				expectedWarnings: [
					{
						code: 'reference-not-placed',
						reference: { tagName: 'Terminal', id: 'terminal-s' },
						attribute: 'connectivityNode',
						path: 'TEMPLATE/TEMPLATE/Bay_HV/L2',
					},
					{
						code: 'reference-not-placed',
						reference: { tagName: 'Terminal', id: 'function-terminal-s' },
						attribute: 'connectivityNode',
						path: 'TEMPLATE/TEMPLATE/Bay_HV/L3',
					},
				],
			},
	}

	async function act({
		testCase,
		project,
		source,
	}: SclTest.ActParams<UpdateTestCase>): Promise<void> {
		const template = await openSclDocument({
			project,
			xml: testCase.templateXml,
			label: 'template',
			allowIncoherentReferences: 'the breakers name nodes of a bay the template does not hold',
		})
		const reported = await report(source.query, {
			verb: 'ssd',
			scenario: 'template',
			sourceQuery: template.query,
			ref: { tagName: 'Substation', id: 'substation-s' } as Scl.Ref<'Substation'>,
			anchor: { tagName: 'VoltageLevel', id: 'voltage-level-t' } as Scl.Ref<'VoltageLevel'>,
		})
		expect(reported.warnings).toEqual(testCase.expectedWarnings)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
