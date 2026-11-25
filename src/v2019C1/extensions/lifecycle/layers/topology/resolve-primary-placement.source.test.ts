import overTwoBaysXml from '../../integration/copy/fixtures/an-application-over-two-bays.xml?raw'
import { assertPlacementDecided } from './placement-landing'
import { resolvePrimaryPlacement } from './resolve-primary-placement'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { countDocumentQueryReads } from '@/v2019C1/test/count-query-reads'

import type { PlacementLevel } from './resolve-placement-mappings.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** BA under S1/VL1, BB under S1/VL2; S2 holds no VoltageLevel. A Substation holds no Bay. */
const baysUnderTwoVoltageLevelsXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Substation name="S1" ${id}="s1">
			<VoltageLevel name="VL1" ${id}="vl1">
				<Bay name="BA" ${id}="ba"/>
			</VoltageLevel>
			<VoltageLevel name="VL2" ${id}="vl2">
				<Bay name="BB" ${id}="bb"/>
			</VoltageLevel>
		</Substation>
		<Substation name="S2" ${id}="s2"/>
	</SCL>
`

/** A ref of a case's document, by its record id. */
function ref<GenericTag extends Scl.ElementsOf>(tagName: GenericTag, recordId: string) {
	return { tagName, id: recordId } as Scl.Ref<GenericTag>
}

/** Each level placed, read for a person: source level, landing, why, and whether it waits on the consumer. */
function describeLevels(levels: readonly PlacementLevel[]): string[] {
	return levels.map(function describeLevel(level) {
		const landing = level.resolved.existing?.id ?? '?'
		const waits = level.undecided
			? level.resolved.ambiguous
				? ' undecided, ambiguous'
				: ' undecided'
			: ''
		return `${level.sourceRef.tagName} ${level.sourceRef.id} → ${landing} (${level.resolved.reason})${waits}`
	})
}

type PlacedCase = SclTest.BaseXmlTestCase & {
	primaryRefs: Scl.Ref<Scl.ElementsOf>[]
	anchor: Scl.Ref<Scl.ElementsOf>
}

// The source levels a copy's primaries sit on land where the place they fall back on admits them; one that does not is
// the consumer's to choose — nothing placed until it chose.
describe('resolvePrimaryPlacement source levels - a fallback that does not admit the primaries', () => {
	const testCases: SclTest.TestCases<PlacedCase & { expected: string[] }> = {
		// S2 holds no VoltageLevel VL1 or VL2, and admits no Bay itself
		'BA and BB placed under S2 → VL1 and VL2 each undecided, the consumer to choose': {
			sourceXml: baysUnderTwoVoltageLevelsXml,
			primaryRefs: [ref('Bay', 'ba'), ref('Bay', 'bb')],
			anchor: ref('Substation', 's2'),
			expected: [
				'VoltageLevel vl1 → ? (none) undecided, ambiguous',
				'VoltageLevel vl2 → ? (none) undecided, ambiguous',
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<PlacedCase & { expected: string[] }>): Promise<void> {
		const placed = resolvePrimaryPlacement(source.query, {
			sourceQuery: source.query,
			primaryRefs: testCase.primaryRefs,
			anchor: testCase.anchor,
			levels: 'source',
		}).then((placement) => describeLevels(placement.levels))
		await expect(placed).resolves.toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('resolvePrimaryPlacement source levels - nothing placed while a level waits on the consumer', () => {
	const testCases: SclTest.TestCases<PlacedCase & { expected: string }> = {
		'BA and BB placed under S2 → MAPPING_UNDECIDED': {
			sourceXml: baysUnderTwoVoltageLevelsXml,
			primaryRefs: [ref('Bay', 'ba'), ref('Bay', 'bb')],
			anchor: ref('Substation', 's2'),
			expected: 'MAPPING_UNDECIDED',
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<PlacedCase & { expected: string }>): Promise<void> {
		const refused = resolvePrimaryPlacement(source.query, {
			sourceQuery: source.query,
			primaryRefs: testCase.primaryRefs,
			anchor: testCase.anchor,
			levels: 'source',
		})
			.then(function assertDecided(placement) {
				assertPlacementDecided({ placementLevels: placement.levels, operation: 'copy' })
				return 'decided'
			})
			.catch((error: unknown) => toDialecteError(error)?.key ?? String(error))
		await expect(refused).resolves.toBe(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type ReadsCase = SclTest.BaseXmlTestCase & {
	/** The functions of the application placed over two levels. */
	twoLevels: Scl.Ref<Scl.ElementsOf>[]
	/** The functions of the application placed over three levels. */
	threeLevels: Scl.Ref<Scl.ElementsOf>[]
	anchor: Scl.Ref<Scl.ElementsOf>
}

// Resolving the rows reads the same whatever their number: never one read per row.
describe('resolvePrimaryPlacement source levels - the reads do not grow with the rows', () => {
	const testCases: SclTest.TestCases<ReadsCase> = {
		// A2's functions sit in B1 and B3; A5's in B1, B3 and VL3/B5
		'the functions of A2 (two bays) and of A5 (three bays) under VL2 → the same reads': {
			sourceXml: overTwoBaysXml,
			twoLevels: [ref('Function', 'f1'), ref('Function', 'f4')],
			threeLevels: [ref('Function', 'f1'), ref('Function', 'f4'), ref('Function', 'f5')],
			anchor: ref('VoltageLevel', 'vl2'),
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<ReadsCase>): Promise<void> {
		async function readsOf(
			primaryRefs: Scl.Ref<Scl.ElementsOf>[],
		): Promise<{ rows: number; reads: string }> {
			const counting = countDocumentQueryReads(source.query as Core.Query<Config>)
			const placement = await resolvePrimaryPlacement(counting.query, {
				sourceQuery: counting.query,
				primaryRefs,
				anchor: testCase.anchor,
				levels: 'source',
			})
			const reads = counting.calls().map((call) => call.method)
			return { rows: placement.levels.length, reads: reads.sort().join(' ') }
		}
		const compared = Promise.all([readsOf(testCase.twoLevels), readsOf(testCase.threeLevels)]).then(
			([two, three]) => ({ rows: [two.rows, three.rows], sameReads: two.reads === three.reads }),
		)
		await expect(compared).resolves.toEqual({ rows: [2, 3], sameReads: true })
	}

	runSclTestCases.withoutExport({ testCases, act })
})
