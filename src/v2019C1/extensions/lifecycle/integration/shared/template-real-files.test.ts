import { describeGroups, findByUuid, reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'
import { readRevisionTwin } from '@/v2019C1/test/revision-twins'

import type { SclTest } from '@/v2019C1/test'

/** The renamed application's uuid, its two instances' bays in the bay template (both revisions share them). */
const APPLICATION_UUID = '00000000-0000-4000-8000-000000000110'
const HIGH_VOLTAGE_BAY_UUID = '00000000-0000-4000-8000-000000000411'

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	expectedInstances: number
	expectedUpToDate: boolean
	/** The apply writes nothing: the project exports as it was. */
	expectedUnchanged: boolean
}

describe('template update of a bay template built from a real application file', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the revision it was built from: both instances matched, up to date, nothing written': {
			sourceXml: readRevisionTwin({ twin: 'applicationRenamesFunctions', revision: 2 }),
			targetXml: readRevisionTwin({ twin: 'twoLevelBayTemplate', revision: 1 }),
			expectedInstances: 2,
			expectedUpToDate: true,
			expectedUnchanged: true,
			expectedQueries: [
				'//default:VoltageLevel[@name="TEMPLATE_HV"]//v2019C1:Application[@type="Interface"]',
				'//default:VoltageLevel[@name="TEMPLATE_MV"]//v2019C1:Application[@type="Interface"]',
			],
		},
		'the revision before: the type change listed, the renamed subfunctions keep the project names':
			{
				sourceXml: readRevisionTwin({ twin: 'applicationRenamesFunctions', revision: 1 }),
				targetXml: readRevisionTwin({ twin: 'twoLevelBayTemplate', revision: 1 }),
				expectedInstances: 2,
				expectedUpToDate: false,
				expectedUnchanged: false,
				expectedQueries: [
					'//v2019C1:Application[@name="Breaker_App"][@type="Protection"]',
					'//default:SubFunction[@name="Trip conditioner"]',
					'//default:SubFunction[@name="Trip output"]',
					'//default:SubFunction[@name="Application management"]',
				],
				unexpectedQueries: [
					'//v2019C1:Application[@name="Breaker_App"][@type="Interface"]',
					'//default:SubFunction[@name="Output conditioner"]',
					'//default:SubFunction[@name="Digital output"]',
					'//default:SubFunction[@name="Device logical node"]',
				],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = {
			verb: 'asd' as const,
			sourceQuery: source.query,
			ref: await findByUuid(source.query, { tagName: 'Application', uuid: APPLICATION_UUID }),
			anchor: await findByUuid(target.query, { tagName: 'Bay', uuid: HIGH_VOLTAGE_BAY_UUID }),
			scenario: 'template' as const,
		}

		const before = await target.query.getSnapshot({ as: 'xml' })
		const { report } = await reportAndApply({ document: target, lifecycle })
		const after = await target.query.getSnapshot({ as: 'xml' })
		expect(after === before).toBe(testCase.expectedUnchanged)

		const applications = report.instances.filter(
			(instance) => instance.tree.tagName === 'Application',
		)
		expect(applications).toHaveLength(testCase.expectedInstances)
		expect(report.instances.every((instance) => instance.upToDate)).toBe(testCase.expectedUpToDate)
		expect(
			await describeGroups({ report, sourceQuery: source.query, targetQuery: target.query }),
		).toMatchSnapshot()

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
