import isdInstanceOfBcu1 from '../../integration/ied/fixtures/isd-instance-of-bcu1-from-project-north.xml?raw'
import isdTemplate from '../../integration/ied/fixtures/isd-template-of-a-bay-controller.xml?raw'
import projectNorth from '../../integration/ied/fixtures/project-north-with-bcu1-placed-from-the-template-first-revision.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseXmlTestCase & {
	sourceFileName: string
	scenario: LifecycleScenario
	expected: { key: string | undefined; meta: unknown; staged: number }
}

// What is not placed yet is refused by the placement itself, before anything is written: the IED of an ISD instance
// file, and an IED `template` finds in the project (project North holds BCU1, placed from the template).
describe('tx.lifecycle.instantiate.ied - a placement not offered', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the IED BCU1 of an ISD instance file → refused, nothing staged': {
			sourceXml: isdInstanceOfBcu1,
			targetXml: projectNorth,
			sourceFileName: 'BCU1.isd',
			scenario: 'instantiate',
			expected: {
				key: 'OPTION_NOT_AVAILABLE',
				meta: { option: 'source', value: 'isd-instance' },
				staged: 0,
			},
		},
		'the template ISD as a template, project North holding BCU1 placed from it → refused, nothing staged':
			{
				sourceXml: isdTemplate,
				targetXml: projectNorth,
				sourceFileName: 'BCU_Template.isd',
				scenario: 'template',
				expected: {
					key: 'OPTION_NOT_AVAILABLE',
					meta: { option: 'scenario', value: 'template' },
					staged: 0,
				},
			},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const imported = await project.importFile(
			new File([testCase.sourceXml], testCase.sourceFileName, { type: 'text/xml' }),
		)
		const sourceQuery = project.openDocument(imported.documentId).query
		const [ied] = await sourceQuery.getRecordsByTagName('IED')
		if (!ied) throw new Error('the source holds no IED')
		const root = await target.query.getRoot()
		const outcome = await target.transaction(async function placeRefused(tx) {
			const refusal = await tx.lifecycle.instantiate
				.ied({
					sourceQuery,
					iedRef: { tagName: 'IED', id: ied.id },
					anchor: { tagName: 'SCL', id: root.id },
					fileType: 'ISD',
					scenario: testCase.scenario,
				})
				.then(
					() => undefined,
					(error: unknown) => toDialecteError(error),
				)
			return { refusal, staged: tx.getStagedOperations().length }
		})
		expect({
			key: outcome.refusal?.key,
			meta: outcome.refusal?.meta,
			staged: outcome.staged,
		}).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
