import { isEmptiedContainer } from './pruned-when-empty'

import { describe, expect, it } from 'vitest'

import { createSclTestRecord } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'

const accessPoint = { tagName: 'AccessPoint', id: 'ap' } as const
const node = { tagName: 'LN0', id: 'ln0' } as const
const scl = { tagName: 'SCL', id: 'scl' } as const
const authentication = { tagName: 'Authentication', id: 'authentication' } as const
const device = { tagName: 'LDevice', id: 'device' } as const
const entry = { tagName: 'FCDA', id: 'entry' } as const
const notes = { tagName: 'Private', id: 'notes' } as const
const nodeType = { tagName: 'LNodeType', id: 'node-type' } as const
const objectType = { tagName: 'DOType', id: 'object-type' } as const
const services = { tagName: 'Services', id: 'services' } as const
const rate = { tagName: 'SmpRate', id: 'rate' } as const
const perSecond = { tagName: 'SamplesPerSec', id: 'per-second' } as const

describe('a container left emptied once what goes is gone', () => {
	const testCases: Record<
		string,
		{
			record: Scl.RawRecord<Scl.ElementsOf>
			gone: string[]
			removed?: { tagName: string }[]
			expected: boolean
		}
	> = {
		'a server losing its last device, its authentication left → goes': {
			record: createSclTestRecord({
				record: { tagName: 'Server', parent: accessPoint, children: [authentication, device] },
			}),
			gone: ['device'],
			expected: true,
		},
		'a server its transaction already took its last device from (read as staged) → goes': {
			record: createSclTestRecord({
				record: { tagName: 'Server', parent: accessPoint, children: [authentication] },
			}),
			gone: [],
			removed: [{ tagName: 'LDevice' }],
			expected: true,
		},
		'a server holding only its authentication, nothing gone (a clean-up) → stays': {
			record: createSclTestRecord({
				record: { tagName: 'Server', parent: accessPoint, children: [authentication] },
			}),
			gone: [],
			expected: false,
		},
		'a data set losing its last entry, a private left → goes': {
			record: createSclTestRecord({
				record: { tagName: 'DataSet', parent: node, children: [notes, entry] },
			}),
			gone: ['entry'],
			expected: true,
		},
		'a data set keeping an entry → stays': {
			record: createSclTestRecord({
				record: { tagName: 'DataSet', parent: node, children: [entry] },
			}),
			gone: [],
			expected: false,
		},
		'data type templates losing their last object type, a node type left → stay': {
			record: createSclTestRecord({
				record: { tagName: 'DataTypeTemplates', parent: scl, children: [nodeType, objectType] },
			}),
			gone: ['object-type'],
			expected: false,
		},
		// SmpRate, SamplesPerSec and SecPerSamples are branches of one choice: one branch staying is enough
		'sampled value settings losing one branch of their choice, another left → stay': {
			record: createSclTestRecord({
				record: { tagName: 'SMVSettings', parent: services, children: [rate, perSecond] },
			}),
			gone: ['per-second'],
			expected: false,
		},
		'data type templates losing every type → go': {
			record: createSclTestRecord({
				record: { tagName: 'DataTypeTemplates', parent: scl, children: [nodeType, objectType] },
			}),
			gone: ['node-type', 'object-type'],
			expected: true,
		},
	}

	for (const [description, testCase] of Object.entries(testCases)) {
		it(description, function judge() {
			expect(
				isEmptiedContainer({
					record: testCase.record,
					gone: new Set(testCase.gone),
					removed: testCase.removed,
				}),
			).toBe(testCase.expected)
		})
	}
})
