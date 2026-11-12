/// <reference types="vite/client" />
import { describe, expect } from 'vitest'

import { report } from '@/v2019C1/extensions/lifecycle/report'
import { runSclTestCases } from '@/v2019C1/test'
import { openSclDocument } from '@/v2019C1/test/open-scl-document'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

/** The fixtures of the update tests, whole documents read as they are. */
const FIXTURES: Readonly<Record<string, string>> = import.meta.glob<string>(
	'../update/transaction/fixtures/*.xml',
	{ query: '?raw', import: 'default', eager: true },
)

/** The case's document is the project holding the placed template; the newer template is opened beside it. */
type UpdateTestCase = SclTest.BaseXmlTestCase & {
	templateXml: string
	/** Where the report says each role the template gains is created, by instance. */
	expectedParentPaths: string[]
}

/** The report says a role an update adds is created where the apply writes it: in its instance's own level. */
describe('report - where an update creates the roles a template gains', () => {
	const testCases: SclTest.TestCases<UpdateTestCase> = {
		'two placed bays, the template gives each a new role "BAY_CTRL" → each listed as created in its own bay':
			{
				sourceXml: FIXTURES['../update/transaction/fixtures/two-bays-placed.xml'],
				templateXml: FIXTURES['../update/transaction/fixtures/two-bays-each-gaining-a-role.xml'],
				expectedParentPaths: ['S1/V1/B1', 'S1/V1/B2'],
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
		})
		const reported = await report(source.query, {
			verb: 'ssd',
			scenario: 'template',
			sourceQuery: template.query,
			ref: { tagName: 'Substation', id: 'substation-s' } as Scl.Ref<'Substation'>,
			anchor: { tagName: 'Substation', id: 'substation-t' } as Scl.Ref<'Substation'>,
		})
		const parentPaths = reported.instances
			.flatMap(function gainedOf(instance) {
				return instance.mappings.filter(function isGained(mapping) {
					return (
						mapping.id.startsWith('bay-ctrl') &&
						mapping.mapping !== undefined &&
						'create' in mapping.mapping
					)
				})
			})
			.map(function parentPathOf(mapping) {
				return mapping.parentPath ?? ''
			})
			.sort()
		expect(parentPaths).toEqual(testCase.expectedParentPaths)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
