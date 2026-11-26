import { applyCopy, ref, reportCopy } from './copy-helpers'
import { b3LandsOn, describeRefusalsBySource } from './copy-placement-helpers'
import { A2, B9, VL1, VL2 } from './copy-placement-helpers.constants'
import overTwoBaysXml from './fixtures/an-application-over-two-bays.xml?raw'
import behaviourXml from './fixtures/an-application-with-a-bay-behaviour.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { CopyCase } from './copy-helpers.types'
import type { Resolution } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

// an-application-over-two-bays.xml: S1/VL1/B1 holds A2 composing F1 (in B1) and F4 (in B3), A3 composing F1 and F1b
// (named F1, in B3), A4 composing F1 and H2 (under VL1 itself), and F1. S1/VL1/B3 holds V4 applying to F4, F4 and F1b.
// S1/VL1 holds H2. S1/VL2 holds B1 (holding a Function F1), B9 (holding one LNode) and a Function named B3.
// applications-to-copy.xml: A1 composes F1 and F2, both in B1; B2 holds nothing.
// and its Block input names the LNode ln9 of VL2/B1; VL2 also holds B9.

// A satellite held by a source level lands where that level lands. The report names no parent for a satellite: what it
// lists of one that depends on where it lands is the copy's refusals (out of reach), judged there too.
describe('asd copy - a satellite held by a source level lands with its level', () => {
	type SatelliteCase = SclTest.BaseXmlTestCase & { copy: CopyCase; resolution?: Resolution }

	const testCases: SclTest.TestCases<SatelliteCase> = {
		// V4 sits in the Private of B3 and applies to F4
		'A2 to VL2, B3 chosen onto B9 → V4 copied into the Private of B9, applying to the copy of F4': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A2, anchor: VL2 },
			resolution: b3LandsOn(B9),
			expectedQueries: [
				'//default:Bay[@name="B9"]/default:Private/v2019C1:Variable[not(@uuid="v4")]/v2019C1:VariableApplyTo[@element="S1/VL2/B9/F4"]',
			],
			unexpectedQueries: ['//default:VoltageLevel[@name="VL2"]/default:Private/v2019C1:Variable'],
		},
		// B3 lands on VL1/B3 by name
		'A2 to VL1 → V4 copied into the Private of VL1/B3, applying to F4_1': {
			sourceXml: overTwoBaysXml,
			copy: { verb: 'asd', ref: A2, anchor: VL1 },
			expectedQueries: [
				'//default:Bay[@name="B3"]/default:Private/v2019C1:Variable[not(@uuid="v4")]/v2019C1:VariableApplyTo[@element="S1/VL1/B3/F4_1"]',
			],
			unexpectedQueries: ['//default:VoltageLevel[@name="VL1"]/default:Private/v2019C1:Variable'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<SatelliteCase>): Promise<SclTest.ActResult> {
		await expect(
			applyCopy({ document: source, copy: testCase.copy, resolution: testCase.resolution }),
		).resolves.toBe('committed')
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// A behaviour held by a source level lands with its level: what its variables reach is judged from there, not from the
// level of the anchor's structure, and the report lists what falls out of that reach.
describe('asd copy - what a satellite reaches, judged where its level lands', () => {
	type ReachCase = SclTest.BaseXmlTestCase & {
		copy: CopyCase
		resolution?: Resolution
		expected: string[]
	}

	const testCases: SclTest.TestCases<ReachCase> = {
		// BB lands in B9 with B3; ln9 sits in VL2/B1, in VL2's reach but not in B9's
		'A6 to VL2, B3 chosen onto B9 → the Block input of BB out of the reach of B9, listed': {
			sourceXml: behaviourXml,
			copy: { verb: 'asd', ref: ref('Application', 'a6'), anchor: VL2 },
			resolution: b3LandsOn(B9),
			expected: ['SCL4004 out-of-scope InputVar#bb-block lnodeUuid'],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<ReachCase>): Promise<void> {
		const listed = reportCopy({
			document: source,
			copy: testCase.copy,
			resolution: testCase.resolution,
		}).then((report) => describeRefusalsBySource(report.refusals ?? []))
		await expect(listed).resolves.toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
