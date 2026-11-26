import { copyTarget, ref } from './copy-helpers'
import overTwoBaysXml from './fixtures/an-application-over-two-bays.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { DecisionMapping } from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'
import type { SclTest } from '@/v2019C1/test'

// an-application-over-two-bays.xml: A2 composes F1 (in S1/VL1/B1) and F4 (in S1/VL1/B3); S1/VL2 holds B1, B9 (holding the
// LNode b9-ln) and a Function named B3.

/** A refusal as the cases compare it: its key and its meta. */
type Refused = { key: string; meta: unknown }

type RefusedCase = SclTest.BaseXmlTestCase & {
	anchor: Scl.Ref<Scl.ElementsOf>
	/** The consumer's choice for the row of B3. */
	decision: DecisionMapping
	expected: Refused
}

const VL2 = ref('VoltageLevel', 'vl2')

// Where the content of a source level lands is the consumer's to change among what the paste allows: an element of the
// document, at or below the anchor, that may hold the copied function. A new level is never created by a copy. Refused at
// the entry by the report and by the apply alike, before anything is written.
describe('asd copy - a choice for a level row refused at its entry', () => {
	const testCases: SclTest.TestCases<RefusedCase> = {
		'B3 chosen to be created → OPTION_NOT_AVAILABLE, a copy creates no level': {
			sourceXml: overTwoBaysXml,
			anchor: VL2,
			decision: { create: {} },
			expected: {
				key: 'OPTION_NOT_AVAILABLE',
				meta: { option: 'decisionMappings', value: 'create' },
			},
		},
		// b9-ln is an LNode of VL2/B9
		'B3 chosen onto an LNode → INVALID_PARENT_CHILD, a Function cannot sit under an LNode': {
			sourceXml: overTwoBaysXml,
			anchor: VL2,
			decision: { existing: ref('LNode', 'b9-ln') },
			expected: {
				key: 'INVALID_PARENT_CHILD',
				meta: { parent: 'LNode', child: 'Function' },
			},
		},
		'B3 chosen onto a record the document lacks → MAPPING_CHOICE_NOT_A_CANDIDATE': {
			sourceXml: overTwoBaysXml,
			anchor: VL2,
			decision: { existing: ref('Bay', 'no-such-bay') },
			expected: {
				key: 'MAPPING_CHOICE_NOT_A_CANDIDATE',
				meta: { sourceId: 'b3', tagName: 'Bay', chosen: { tagName: 'Bay', id: 'no-such-bay' } },
			},
		},
		// VL1/B3 is outside VL2
		'B3 chosen onto VL1/B3, outside the anchor VL2 → MAPPING_CHOICE_NOT_A_CANDIDATE': {
			sourceXml: overTwoBaysXml,
			anchor: VL2,
			decision: { existing: ref('Bay', 'b3') },
			expected: {
				key: 'MAPPING_CHOICE_NOT_A_CANDIDATE',
				meta: { sourceId: 'b3', tagName: 'Bay', chosen: { tagName: 'Bay', id: 'b3' } },
			},
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<RefusedCase>): Promise<void> {
		const target = {
			...copyTarget({
				sourceQuery: source.query,
				copy: { verb: 'asd', ref: ref('Application', 'a2'), anchor: testCase.anchor },
			}),
			resolution: { mappings: new Map([['b3', testCase.decision]]) },
		}
		const reported = source.query.lifecycle.report(target).then(() => 'reported', refusedWith)
		const applied = source
			.transaction(async function applyTheCopy(tx) {
				await tx.lifecycle.apply({ ...target, report: AN_EMPTY_REPORT })
			})
			.then(() => 'applied', refusedWith)
		await expect(Promise.all([reported, applied])).resolves.toEqual([
			testCase.expected,
			testCase.expected,
		])
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** A report with nothing in it: the refusal at the apply's entry comes before the report is read. */
const AN_EMPTY_REPORT: DiffReport = {
	instances: [],
	needsDecisions: false,
	summary: { added: 0, removed: 0, modified: 0, moved: 0, kept: 0 },
	mappings: [],
	templateInstances: [],
}

/** The key and the meta of the refusal an error is. */
function refusedWith(error: unknown): Refused {
	const refusal = toDialecteError(error)
	return { key: refusal?.key ?? String(error), meta: refusal?.meta }
}
