import { applyCopy, reportCopy } from './copy-helpers'
import {
	b3LandsOn,
	describeKeysTaken,
	describeLevelRows,
	notLandedAsPromised,
	promisedLandings,
} from './copy-placement-helpers'
import { A2, A3, A4, B9, S1, VL1, VL2 } from './copy-placement-helpers.constants'
import overTwoBaysXml from './fixtures/an-application-over-two-bays.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { CopyCase } from './copy-helpers.types'
import type { Resolution } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

// an-application-over-two-bays.xml: S1/VL1/B1 holds A2 composing F1 (in B1) and F4 (in B3), A3 composing F1 and F1b
// (named F1, in B3), A4 composing F1 and H2 (under VL1 itself), and F1. S1/VL1/B3 holds V4 applying to F4, F4 and F1b.
// S1/VL1 holds H2. S1/VL2 holds B1 (holding a Function F1), B9 (holding one LNode) and a Function named B3.
// applications-to-copy.xml: A1 composes F1 and F2, both in B1; B2 holds nothing.

// The key a function's name takes is judged where that function lands, told apart from what the copy placed there
// before it; the apply writes what the report proposes.
describe('asd copy - the key taken judged where each function lands', () => {
	type KeyTakenCase = SclTest.BaseXmlTestCase & { copy: CopyCase; expected: string[] }

	const testCases: SclTest.TestCases<KeyTakenCase> = {
		// VL2/B1 holds a Function F1; VL2 holds no F4
		'A2 to VL2 → F1 taken in VL2/B1 by its F1, F1_1 proposed and written; F4 under VL2 taken nowhere':
			{
				sourceXml: overTwoBaysXml,
				copy: { verb: 'asd', ref: A2, anchor: VL2 },
				expected: ['Function uniqueChildNameInBay name=F1 taken by Function vl2-f1 → name=F1_1'],
				expectedQueries: [
					'//default:VoltageLevel[@name="VL2"]/default:Bay[@name="B1"]/default:Function[@name="F1_1"]',
				],
			},
		// A3's F1 (from B1) and F1b (named F1, from B3) both land in B9, which holds no function
		'A3 to VL2/B9 → the second F1 placed there taken by the copy of the first, F1_1 proposed and written':
			{
				sourceXml: overTwoBaysXml,
				copy: { verb: 'asd', ref: A3, anchor: B9 },
				expected: [
					'Function uniqueChildNameInBay name=F1 taken by the copy of Function f1 → name=F1_1',
				],
				expectedQueries: [
					'//default:Bay[@name="B9"]/default:Function[@name="F1"][not(@uuid="f1")]',
					'//default:Bay[@name="B9"]/default:Function[@name="F1_1"]',
				],
			},
		// A3's F1 lands in VL1/B1 beside F1, its F1b (named F1) in VL1/B3 beside F1b: each judged in its own bay only
		'A3 to VL1 → F1 taken in B1 and F1b taken in B3, each F1_1 where it lands, never F1_2': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A3, anchor: VL1 },
			expected: [
				'Function uniqueChildNameInBay name=F1 taken by Function f1 → name=F1_1',
				'Function uniqueChildNameInBay name=F1 taken by Function f1b → name=F1_1',
			],
			expectedQueries: [
				'//default:VoltageLevel[@name="VL1"]/default:Bay[@name="B1"]/default:Function[@name="F1_1"]',
				'//default:VoltageLevel[@name="VL1"]/default:Bay[@name="B3"]/default:Function[@name="F1_1"]',
			],
			unexpectedQueries: ['//default:Function[@name="F1_2"]'],
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

// Report == apply: every function lands under the element its row maps its source level onto, under the name the report
// proposes (its own when nothing is taken).
describe('asd copy - the apply lands each function as the report says', () => {
	type ParityCase = SclTest.BaseXmlTestCase & {
		copy: CopyCase
		resolution?: Resolution
		/** How many functions the copy places. */
		functions: number
		/** How many level rows the report lists. */
		rows: number
	}

	const testCases: SclTest.TestCases<ParityCase> = {
		'A2 to VL2 → each function where its row lands, named as proposed': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A2, anchor: VL2 },
			functions: 2,
			rows: 2,
		},
		'A2 to VL1 → each function where its row lands, named as proposed': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A2, anchor: VL1 },
			functions: 2,
			rows: 2,
		},
		'A3 to VL2/B9 → each function where its row lands, named as proposed': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A3, anchor: B9 },
			functions: 2,
			rows: 2,
		},
		'A4 to VL2 → each function where its row lands, named as proposed': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A4, anchor: VL2 },
			functions: 2,
			rows: 2,
		},
		'A2 to VL2, B3 chosen onto B9 → each function where its row lands, named as proposed': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A2, anchor: VL2 },
			resolution: b3LandsOn(B9),
			functions: 2,
			rows: 2,
		},
		'A3 to VL1 → each function where its row lands, named as proposed': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A3, anchor: VL1 },
			functions: 2,
			rows: 2,
		},
		'A2 to S1 → each function where its row lands, named as proposed': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A2, anchor: S1 },
			functions: 2,
			rows: 2,
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<ParityCase>): Promise<void> {
		const params = { document: source, copy: testCase.copy, resolution: testCase.resolution }
		const compared = reportCopy(params).then(async function thenApply(report) {
			const promised = await promisedLandings({
				report,
				document: source,
				anchor: testCase.copy.anchor,
			})
			const applied = await applyCopy(params)
			const notLanded = await notLandedAsPromised({ document: source, promised })
			return {
				applied,
				rows: describeLevelRows(report).length,
				functions: promised.length,
				notLanded,
			}
		})
		await expect(compared).resolves.toEqual({
			applied: 'committed',
			rows: testCase.rows,
			functions: testCase.functions,
			notLanded: [],
		})
	}

	runSclTestCases.withoutExport({ testCases, act })
})
