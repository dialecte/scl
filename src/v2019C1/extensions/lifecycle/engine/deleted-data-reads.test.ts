import { diff } from './diff'
import { readDiffPolicy } from './diff-policy'
import project from './fixtures/own-references/project.xml?raw'
import templateWithQualityMeasured from './fixtures/own-references/template-with-quality-measured.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const sourceRootRef = { tagName: 'IED', id: 'ied-s' } as Scl.Ref<'IED'>
const instanceRootRef = { tagName: 'IED', id: 'ied-t' } as Scl.Ref<'IED'>

describe('reads of a diff with references to deleted data', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** Per side, the tags read by tag among those counted, over two diffs of one update, sorted. */
		expected: { source: string[]; target: string[] }
	}

	const counted = new Set(['FCDA', 'ExtRef', 'LNodeType'])

	const testCases: SclTest.TestCases<TestCase> = {
		// project.xml against the template moving the quality to fc MX (a type change, the own q entry waiting), diffed
		// twice as two instances of one update would be
		'two diffs of one update → the references read once, the logical node types once per diff and side':
			{
				sourceXml: templateWithQualityMeasured,
				targetXml: project,
				expected: {
					source: ['LNodeType', 'LNodeType'],
					target: ['ExtRef', 'FCDA', 'LNodeType', 'LNodeType'],
				},
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const sourceReads = countQueryReads(source.query)
		const targetReads = countQueryReads(target.query)
		const params = {
			sourceQuery: sourceReads.query,
			targetQuery: targetReads.query,
			sourceRootRef,
			instanceRootRef,
			diffPolicy: readDiffPolicy({}),
			reads: { referrersByTag: new Map() },
		}
		// two instances of one update, here the same one twice, sharing the update's reads
		await diff(params)
		// dialecte-allow act-repeats-call: two diffs of one update sharing their reads are the behaviour under test
		await diff(params)
		expect({
			source: tagsRead(sourceReads.calls),
			target: tagsRead(targetReads.calls),
		}).toEqual(testCase.expected)
	}

	/** The tags read by tag among those counted, sorted. */
	function tagsRead(calls: readonly { method: string; args: readonly unknown[] }[]): string[] {
		return calls
			.filter((call) => call.method === 'getRecordsByTagName')
			.map((call) => String(call.args[0]))
			.filter((tagName) => counted.has(tagName))
			.sort()
	}

	runSclTestCases.withoutExport({ testCases, act })
})
