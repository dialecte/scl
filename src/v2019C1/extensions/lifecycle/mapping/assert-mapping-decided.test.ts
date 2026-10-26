import { assertReportMappingsDecided } from './assert-mapping-decided'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { DecisionMapping, ReportMapping } from './mapping.types'

/** A mapping of the report: decided onto a new element, or left to the consumer. */
function mapping(params: {
	id: string
	decided: boolean
	kind?: ReportMapping['kind']
	dependsOn?: string
	sourceId?: string
	placedFor?: string
}): ReportMapping {
	const { id, decided, dependsOn, sourceId, placedFor } = params
	return {
		id,
		...(sourceId ? { sourceId } : {}),
		...(placedFor ? { placedFor: { tagName: 'Application', id: placedFor } } : {}),
		tagName: params.kind === 'level' ? 'Bay' : 'AllocationRole',
		kind: params.kind ?? 'shared',
		...(decided ? { mapping: { create: {} } } : {}),
		reason: 'name',
		ambiguous: !decided,
		selectable: true,
		locked: false,
		candidates: [],
		...(dependsOn ? { dependsOn } : {}),
	}
}

const created: DecisionMapping = { create: {} }

type TestCase = {
	only?: boolean
	reportMappings: ReportMapping[]
	chosen: string[]
	/** The project elements an accepted group writes for. */
	writtenFor?: string[]
	/** The refusal's data; absent: nothing refused. */
	expectedRefusal?: Record<string, unknown>
}

describe('assertReportMappingsDecided — a mapping left to the consumer is chosen before anything is written', () => {
	const testCases: Record<string, TestCase> = {
		'every mapping decided -> ok': {
			reportMappings: [mapping({ id: 'role-s', decided: true })],
			chosen: [],
		},
		'a mapping left undecided, not chosen -> refused, naming it': {
			reportMappings: [mapping({ id: 'role-s', decided: false })],
			chosen: [],
			expectedRefusal: { sourceId: 'role-s', tagName: 'AllocationRole', kind: 'shared' },
		},
		'a mapping left undecided for one instance written, not chosen -> refused, naming its source element':
			{
				reportMappings: [
					mapping({
						id: 'instance-t::role-s',
						sourceId: 'role-s',
						placedFor: 'instance-t',
						decided: false,
					}),
				],
				chosen: [],
				writtenFor: ['instance-t'],
				expectedRefusal: { sourceId: 'role-s', tagName: 'AllocationRole', kind: 'shared' },
			},
		'a mapping left undecided for one instance nothing is written for -> ok': {
			reportMappings: [
				mapping({
					id: 'instance-t::role-s',
					sourceId: 'role-s',
					placedFor: 'instance-t',
					decided: false,
				}),
			],
			chosen: [],
			writtenFor: ['another-instance'],
		},
		'a mapping left undecided, chosen -> ok': {
			reportMappings: [mapping({ id: 'role-s', decided: false })],
			chosen: ['role-s'],
		},
		'a level undecided because the level above is, the level above chosen -> ok': {
			reportMappings: [
				mapping({ id: 'vl-s', decided: false, kind: 'level' }),
				mapping({ id: 'bay-s', decided: false, kind: 'level', dependsOn: 'vl-s' }),
			],
			chosen: ['vl-s'],
		},
		'a level undecided below a level above chosen two levels up -> ok': {
			reportMappings: [
				mapping({ id: 'sub-s', decided: false, kind: 'level' }),
				mapping({ id: 'vl-s', decided: false, kind: 'level', dependsOn: 'sub-s' }),
				mapping({ id: 'bay-s', decided: false, kind: 'level', dependsOn: 'vl-s' }),
			],
			chosen: ['sub-s'],
		},
		'two mappings each following the other, neither chosen (a malformed report) -> refused': {
			reportMappings: [
				mapping({ id: 'vl-s', decided: false, kind: 'level', dependsOn: 'bay-s' }),
				mapping({ id: 'bay-s', decided: false, kind: 'level', dependsOn: 'vl-s' }),
			],
			chosen: [],
			expectedRefusal: { sourceId: 'vl-s', tagName: 'Bay', kind: 'level' },
		},
		'a level undecided, nothing above it chosen -> refused, naming it': {
			reportMappings: [
				mapping({ id: 'vl-s', decided: true, kind: 'level' }),
				mapping({ id: 'bay-s', decided: false, kind: 'level', dependsOn: 'vl-s' }),
			],
			chosen: [],
			expectedRefusal: { sourceId: 'bay-s', tagName: 'Bay', kind: 'level' },
		},
	}

	function act(testCase: TestCase) {
		const decisionMappings = new Map(testCase.chosen.map((id) => [id, created]))
		let thrown: unknown
		try {
			assertReportMappingsDecided({
				reportMappings: testCase.reportMappings,
				decisionMappings,
				writtenFor: new Set(testCase.writtenFor ?? []),
			})
		} catch (error) {
			thrown = error
		}
		if (!testCase.expectedRefusal) {
			expect(thrown).toBeUndefined()
			return
		}
		const refusal = toDialecteError(thrown)
		expect({ key: refusal?.key, meta: refusal?.meta }).toEqual({
			key: 'MAPPING_UNDECIDED',
			meta: testCase.expectedRefusal,
		})
	}

	runSclTestCases.generic(testCases, act)
})
