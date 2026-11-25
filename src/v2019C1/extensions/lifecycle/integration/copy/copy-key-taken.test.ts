import { applyCopy, ref, reportCopy } from './copy-helpers'
import functionXml from './fixtures/a-function-to-copy.xml?raw'
import applicationsXml from './fixtures/applications-to-copy.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { CopyCase } from './copy-helpers.types'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

// a-function-to-copy.xml: B1 holds F1 (f1); applications-to-copy.xml: B1 holds A1 (a1) composing F1 (f1) and F2 (f2).

// The report tells, on the group placing each root of the copy, the key a sibling where it lands holds already and the
// values the engine numbers instead; the apply writes those values.
describe('copy - the key taken where it lands, reported as the apply writes it', () => {
	type KeyTakenCase = SclTest.BaseXmlTestCase & { copy: CopyCase; expected: string[] }

	const testCases: SclTest.TestCases<KeyTakenCase> = {
		// B1 holds F1
		'F1 beside itself in B1 → its name taken by F1 under uniqueChildNameInBay, F1_1 proposed and written':
			{
				sourceXml: functionXml,
				copy: { verb: 'fsd', ref: ref('Function', 'f1'), anchor: ref('Bay', 'b1') },
				expected: ['Function uniqueChildNameInBay name=F1 taken by Function f1 → name=F1_1'],
				expectedQueries: ['//default:Bay[@name="B1"]/default:Function[@name="F1_1"]'],
			},
		// B1 holds A1, F1 and F2: the Application is judged in the bay through its Private
		'A1 beside itself in B1 → A1, F1 and F2 each taken, A1_1, F1_1 and F2_1 proposed and written': {
			sourceXml: applicationsXml,
			copy: { verb: 'asd', ref: ref('Application', 'a1'), anchor: ref('Bay', 'b1') },
			expected: [
				'Application uniqueChildNameInBay name=A1 taken by Application a1 → name=A1_1',
				'Function uniqueChildNameInBay name=F1 taken by Function f1 → name=F1_1',
				'Function uniqueChildNameInBay name=F2 taken by Function f2 → name=F2_1',
			],
			expectedQueries: [
				'//default:Bay[@name="B1"]/default:Private/v2019C1:Application[@name="A1_1"]',
				'//default:Bay[@name="B1"]/default:Function[@name="F1_1"]',
				'//default:Bay[@name="B1"]/default:Function[@name="F2_1"]',
			],
		},
		// B2 holds nothing: nothing is taken
		'F1 to B2 → no key taken': {
			sourceXml: functionXml,
			copy: { verb: 'fsd', ref: ref('Function', 'f1'), anchor: ref('Bay', 'b2') },
			expected: [],
			expectedQueries: ['//default:Bay[@name="B2"]/default:Function[@name="F1"]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<KeyTakenCase>): Promise<SclTest.ActResult> {
		const reportedThenApplied = reportCopy({ document: source, copy: testCase.copy }).then(
			async function thenApply(report) {
				const applied = await applyCopy({ document: source, copy: testCase.copy })
				return { keyTaken: describeKeysTaken(report), applied }
			},
		)
		await expect(reportedThenApplied).resolves.toEqual({
			keyTaken: testCase.expected,
			applied: 'committed',
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** Each key taken the report tells, on the group of the root it places, read for a person. */
function describeKeysTaken(report: DiffReport): string[] {
	return report.instances
		.flatMap((instance) => instance.groups)
		.flatMap(function describeGroup(group) {
			const taken = group.keyTaken
			if (!taken) return []
			return [
				`${group.primary.tagName} ${taken.constraint} ${describeValues(taken.values)} taken by ${taken.takenBy.tagName} ${taken.takenBy.id} → ${describeValues(taken.proposed)}`,
			]
		})
		.sort()
}

/** The values of a key, field by field. */
function describeValues(values: Readonly<Record<string, string>>): string {
	return Object.entries(values)
		.map(([field, value]) => `${field}=${value}`)
		.join(' ')
}
