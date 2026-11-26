import { applyCopy, ref, reportCopy } from './copy-helpers'
import { b3LandsOn, describeLevelRows } from './copy-placement-helpers'
import { A2, A4, B1, B9, S1, VL1, VL2, VL2_B1 } from './copy-placement-helpers.constants'
import overTwoBaysXml from './fixtures/an-application-over-two-bays.xml?raw'
import applicationsXml from './fixtures/applications-to-copy.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { CopyCase } from './copy-helpers.types'
import type { Resolution } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

// an-application-over-two-bays.xml: S1/VL1/B1 holds A2 composing F1 (in B1) and F4 (in B3), A3 composing F1 and F1b
// (named F1, in B3), A4 composing F1 and H2 (under VL1 itself), and F1. S1/VL1/B3 holds V4 applying to F4, F4 and F1b.
// S1/VL1 holds H2. S1/VL2 holds B1 (holding a Function F1), B9 (holding one LNode) and a Function named B3.
// applications-to-copy.xml: A1 composes F1 and F2, both in B1; B2 holds nothing.
// an-application-with-a-bay-behaviour.xml: A6 composes F1 (in VL1/B1) and F4 (in VL1/B3); B3's behaviour BB applies to F4

// A copy whose functions sit under several levels of the topology gets one row per source level, top-down, each landing
// the content of its level on the level of the same tag and name directly under where the level above lands — else on
// that place itself; the place a row lands on is its first candidate, the levels of its tag there follow.
describe('asd copy - one level row per source level of the functions', () => {
	type RowsCase = SclTest.BaseXmlTestCase & {
		copy: CopyCase
		resolution?: Resolution
		expected: string[]
	}

	const testCases: SclTest.TestCases<RowsCase> = {
		// VL2 holds B1, B9 and a Function named B3: no Bay B3
		'A2 to VL2 → B1 onto VL2/B1 by name, B3 onto VL2 itself, the Function named B3 not matched': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A2, anchor: VL2 },
			expected: ['Bay b1 → vl2-b1 (name) [vl2 vl2-b1 b9]', 'Bay b3 → vl2 (anchor) [vl2 vl2-b1 b9]'],
		},
		// B9 holds no Bay
		'A2 to the bay VL2/B9 → each row onto B9 itself': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A2, anchor: B9 },
			expected: ['Bay b1 → b9 (anchor) [b9]', 'Bay b3 → b9 (anchor) [b9]'],
		},
		'A2 to VL2, B3 chosen onto VL2/B1 → the row of B3 is the decision': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A2, anchor: VL2 },
			resolution: b3LandsOn(VL2_B1),
			expected: [
				'Bay b1 → vl2-b1 (name) [vl2 vl2-b1 b9]',
				'Bay b3 → vl2-b1 (decision) [vl2 vl2-b1 b9]',
			],
		},
		// A1's functions both sit in B1
		'A1, its functions under one level, to B2 → no level row': {
			sourceXml: applicationsXml,
			copy: { verb: 'asd', ref: ref('Application', 'a1'), anchor: ref('Bay', 'b2') },
			expected: [],
		},
		// the anchor is one of the source levels: B1 holds no Bay B1
		'A2 to VL1/B1, a source level itself → both rows onto B1': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A2, anchor: B1 },
			expected: ['Bay b1 → b1 (anchor) [b1]', 'Bay b3 → b1 (anchor) [b1]'],
		},
		// the anchor holds both source levels
		'A2 to VL1, the level both sit under → B1 and B3 onto themselves by name': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A2, anchor: VL1 },
			expected: ['Bay b1 → b1 (name) [vl1 b1 b3]', 'Bay b3 → b3 (name) [vl1 b1 b3]'],
		},
		// B1 and B3 sit under S1/VL1: S1 holds no Bay of its own, the name is matched on its direct children only
		'A2 to S1 → both rows onto S1 itself, the bays below VL1 not matched': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A2, anchor: S1 },
			expected: ['Bay b1 → s1 (anchor) [s1]', 'Bay b3 → s1 (anchor) [s1]'],
		},
		// H2 sits under VL1 itself, F1 under VL1/B1: B1's row follows where VL1 lands
		'A4 to VL2 → VL1 onto VL2 itself, then B1, after it, onto VL2/B1 by name': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A4, anchor: VL2 },
			expected: [
				'VoltageLevel vl1 → vl2 (anchor) [vl2]',
				'Bay b1 → vl2-b1 (name) after vl1 [vl2 vl2-b1 b9]',
			],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<RowsCase>): Promise<void> {
		const rows = reportCopy({
			document: source,
			copy: testCase.copy,
			resolution: testCase.resolution,
		}).then(describeLevelRows)
		await expect(rows).resolves.toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// The apply lands the content of each source level where its row says, the application under the anchor.
describe('asd copy - the functions landed as their rows say', () => {
	type LandedCase = SclTest.BaseXmlTestCase & { copy: CopyCase; resolution?: Resolution }

	const testCases: SclTest.TestCases<LandedCase> = {
		'A2 to VL2 → F1 copied under VL2/B1, F4 under VL2 itself, A2 in the Private of VL2 composing both':
			{
				sourceXml: overTwoBaysXml,
				copy: { verb: 'asd', ref: A2, anchor: VL2 },
				expectedQueries: [
					'//default:VoltageLevel[@name="VL2"]/default:Bay[@name="B1"]/default:Function[@name="F1_1"][not(@uuid="f1")]',
					'//default:VoltageLevel[@name="VL2"]/default:Function[@name="F4"][not(@uuid="f4")]',
					'//default:VoltageLevel[@name="VL2"]/default:Private/v2019C1:Application[@name="A2"][not(@uuid="a2")]//v2019C1:FunctionRef[@function="S1/VL2/B1/F1_1"]',
					'//default:VoltageLevel[@name="VL2"]/default:Private/v2019C1:Application[@name="A2"]//v2019C1:FunctionRef[@function="S1/VL2/F4"]',
				],
				unexpectedQueries: ['//default:VoltageLevel[@name="VL2"]/default:Bay[@name="B3"]'],
			},
		'A2 to the bay VL2/B9 → F1 and F4 both copied under B9': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A2, anchor: B9 },
			expectedQueries: [
				'//default:Bay[@name="B9"]/default:Function[@name="F1"][not(@uuid="f1")]',
				'//default:Bay[@name="B9"]/default:Function[@name="F4"][not(@uuid="f4")]',
			],
		},
		'A2 to VL2, B3 chosen onto VL2/B1 → F4 copied under VL2/B1': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A2, anchor: VL2 },
			resolution: b3LandsOn(VL2_B1),
			expectedQueries: [
				'//default:VoltageLevel[@name="VL2"]/default:Bay[@name="B1"]/default:Function[@name="F4"][not(@uuid="f4")]',
			],
			unexpectedQueries: ['//default:VoltageLevel[@name="VL2"]/default:Function[@name="F4"]'],
		},
		// B1 holds F1 already
		'A2 to VL1/B1, a source level itself → F1_1 and F4 copied under B1': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A2, anchor: B1 },
			expectedQueries: [
				'//default:VoltageLevel[@name="VL1"]/default:Bay[@name="B1"]/default:Function[@name="F1_1"]',
				'//default:VoltageLevel[@name="VL1"]/default:Bay[@name="B1"]/default:Function[@name="F4"][not(@uuid="f4")]',
			],
		},
		// B1 holds F1, B3 holds F4
		'A2 to VL1 → the copies beside the originals, F1_1 in B1 and F4_1 in B3': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A2, anchor: VL1 },
			expectedQueries: [
				'//default:VoltageLevel[@name="VL1"]/default:Bay[@name="B1"]/default:Function[@name="F1_1"]',
				'//default:VoltageLevel[@name="VL1"]/default:Bay[@name="B3"]/default:Function[@name="F4_1"]',
			],
		},
		'A2 to S1 → F1 and F4 copied under S1 itself, the bays of VL1 left as they are': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A2, anchor: S1 },
			expectedQueries: [
				'/default:SCL/default:Substation[@name="S1"]/default:Function[@name="F1"][not(@uuid="f1")]',
				'/default:SCL/default:Substation[@name="S1"]/default:Function[@name="F4"][not(@uuid="f4")]',
			],
			unexpectedQueries: [
				'//default:VoltageLevel[@name="VL1"]/default:Bay[@name="B1"]/default:Function[2]',
				'//default:VoltageLevel[@name="VL1"]/default:Bay[@name="B3"]/default:Function[3]',
			],
		},
		'A4 to VL2 → H2 copied under VL2 itself, F1 under VL2/B1': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A4, anchor: VL2 },
			expectedQueries: [
				'//default:VoltageLevel[@name="VL2"]/default:Function[@name="H2"][not(@uuid="h2")]',
				'//default:VoltageLevel[@name="VL2"]/default:Bay[@name="B1"]/default:Function[@name="F1_1"]',
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<LandedCase>): Promise<SclTest.ActResult> {
		await expect(
			applyCopy({ document: source, copy: testCase.copy, resolution: testCase.resolution }),
		).resolves.toBe('committed')
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
