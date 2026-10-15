import { buildImportPathIndex } from './import-path-index'

import { describe, expect, it } from 'vitest'

import { createSclTestRecord } from '@/v2019C1/test'

import type { CollectedTarget } from './io-hooks.types'
import type { AnyRawRecord } from '@dialecte/core'

const ied = createSclTestRecord({ record: { tagName: 'IED', attributes: { name: 'P1' } } })
const accessPoint = createSclTestRecord({
	record: { tagName: 'AccessPoint', attributes: { name: 'AP1' } },
})
const lDevice = createSclTestRecord({ record: { tagName: 'LDevice', attributes: { inst: 'LD0' } } })
const ln0 = createSclTestRecord({
	record: { tagName: 'LN0', attributes: { lnClass: 'LLN0', inst: '', lnType: 'LLN0_T' } },
})
const controlBlock = createSclTestRecord({
	record: { tagName: 'GSEControl', attributes: { name: 'gcb1', appID: 'gcb1' } },
})

describe('buildImportPathIndex', () => {
	type TestCase = { targets: CollectedTarget[]; expected: Record<string, string> }

	const testCases: Record<string, TestCase> = {
		'elements without a path segment of their own, parents first -> each path names its own element':
			{
				targets: [
					{ record: ied, ancestry: [], uuid: 'ied-uuid' },
					{ record: accessPoint, ancestry: [ied], uuid: 'ap-uuid' },
					{ record: lDevice, ancestry: [ied, accessPoint], uuid: 'ld-uuid' },
					{ record: ln0, ancestry: [ied, accessPoint, lDevice], uuid: 'ln0-uuid' },
					{ record: controlBlock, ancestry: [ied, accessPoint, lDevice, ln0], uuid: 'gcb-uuid' },
				],
				expected: { P1: 'ied-uuid', 'P1/LD0': 'ld-uuid', 'P1/LD0/LLN0': 'ln0-uuid' },
			},
		'elements without a path segment of their own, children first (as an import collects them) -> each path names its own element':
			{
				targets: [
					{ record: controlBlock, ancestry: [ied, accessPoint, lDevice, ln0], uuid: 'gcb-uuid' },
					{ record: ln0, ancestry: [ied, accessPoint, lDevice], uuid: 'ln0-uuid' },
					{ record: lDevice, ancestry: [ied, accessPoint], uuid: 'ld-uuid' },
					{ record: accessPoint, ancestry: [ied], uuid: 'ap-uuid' },
					{ record: ied, ancestry: [], uuid: 'ied-uuid' },
				],
				expected: { P1: 'ied-uuid', 'P1/LD0': 'ld-uuid', 'P1/LD0/LLN0': 'ln0-uuid' },
			},
	}

	it.each(Object.entries(testCases))('%s', (_, testCase) => {
		const index = buildImportPathIndex({ targets: testCase.targets, specNamings: new Map() })
		expect(Object.fromEntries(index.byPath)).toEqual(testCase.expected)
	})
})
