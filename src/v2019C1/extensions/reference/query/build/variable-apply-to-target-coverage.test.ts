import { describe, expect, test } from 'vitest'

import { ATTRIBUTES, ELEMENT_NAMES } from '@/v2019C1/definition/constants.generated'
import { PATH_EXTRACTION_CONFIG } from '@/v2019C1/extensions/reference/constants/path-extraction'

/**
 * Exhaustive coverage for the path-build side of `VariableApplyTo`.
 *
 * A `VariableApplyTo.elementUuid` can point at ANY uuid-bearing element, so
 * "every possible target" == every element whose definition carries a `uuid`
 * attribute. For each, `buildReferencePath` either builds a coherent name-path
 * (the element has a path-segment rule) or refuses and leaves the path untouched
 * (segment-less / transparent). This test pins that partition so a newly added
 * element type cannot silently fall through without a decision.
 */
describe('VariableApplyTo target coverage — every uuid-bearing element is classified', () => {
	const attrsOf = (element: string): string[] => {
		const attrs = (ATTRIBUTES as Record<string, unknown>)[element]
		return Array.isArray(attrs) ? (attrs as string[]) : Object.keys((attrs as object) ?? {})
	}

	const uuidBearingTargets = (ELEMENT_NAMES as readonly string[]).filter((element) =>
		attrsOf(element).includes('uuid'),
	)

	// uuid-bearing elements with NO path segment of their own — `buildElementPath`
	// returns null for these, so `buildReferencePath` leaves the existing path as-is
	// (never writes a truncated/parent-addressing path). Mostly IED control blocks,
	// communication, and file-level containers a Variable does not address.
	const EXPECTED_SEGMENT_LESS = new Set<string>([
		'AccessPoint',
		'DataSet',
		'FunctionRole',
		'GOOSESecurity',
		'GSEControl',
		'Header',
		'LogControl',
		'Project',
		'ReportControl',
		'SMVSecurity',
		'SampledValueControl',
		'SignalRole',
		'SubNetwork',
	])

	const hasSegmentRule = (element: string): boolean => {
		const strategy = (PATH_EXTRACTION_CONFIG as Record<string, { type: string }>)[element]
		return Boolean(strategy) && strategy.type !== 'transparent'
	}

	test('the uuid-bearing target set is stable (guards against schema drift)', () => {
		expect(uuidBearingTargets.length).toBe(51)
	})

	test('every uuid-bearing target either has a path-segment rule or is a known segment-less container', () => {
		for (const element of uuidBearingTargets) {
			if (EXPECTED_SEGMENT_LESS.has(element)) {
				expect(hasSegmentRule(element), `${element} should be segment-less`).toBe(false)
			} else {
				expect(hasSegmentRule(element), `${element} should have a path-segment rule`).toBe(true)
			}
		}
	})

	test('the expected segment-less set contains only uuid-bearing targets (no stale entries)', () => {
		const targets = new Set(uuidBearingTargets)
		for (const element of EXPECTED_SEGMENT_LESS) {
			expect(targets.has(element), `${element} is no longer a uuid-bearing target`).toBe(true)
		}
	})
})
