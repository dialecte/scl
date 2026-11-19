/// <reference types="vite/client" />
import { toRawRecord } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { followTupleTargetRename } from '@/v2019C1/hooks/shared/tuple-reference-rename'
import { runSclTestCases } from '@/v2019C1/test'
import { countDocumentQueryReads } from '@/v2019C1/test/count-query-reads'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/** The fixtures of this file, whole documents read as they are. */
const FIXTURES: Readonly<Record<string, string>> = import.meta.glob<string>('./fixtures/*.xml', {
	query: '?raw',
	import: 'default',
	eager: true,
})

const subscription = FIXTURES['./fixtures/one-subscription-by-uuid-and-by-names.xml']

/**
 * The tuple references of a rename are found by lookups: no whole read of a referrer tag, but of `IEDName`, which
 * names its IED by its text (no attribute to look up).
 */
describe('a rename finds its tuple references by lookups', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		rename: { tagName: 'IED' | 'LDevice'; id: string; attributes: Record<string, string> }
		expected: { tagReads: string[]; lookups: string[] }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'P2 renamed -> one lookup per referrer tag and uuid attribute, the IED names looked up, IEDName read whole':
			{
				sourceXml: subscription,
				rename: { tagName: 'IED', id: 'p2', attributes: { name: 'P9' } },
				expected: {
					tagReads: ['IEDName'],
					lookups: [
						'IED name',
						'LNodeSpecNaming sIedName',
						'Association iedName',
						'ClientLN iedName',
						'ConnectedAP iedName',
						'ExtCtrl iedName',
						'ExtRef iedName',
						'LNode iedName',
						'KDC iedName',
						'Association lnUuid',
						'ClientLN lnUuid',
						'ConnectedAP apUuid',
						'ExtCtrl lnUuid',
						'ExtRef lnUuid',
						'ExtRef srcCBUuid',
						'FCDA lnUuid',
						'GSE cbUuid',
						'IEDName apUuid',
						'IEDName ldUuid',
						'IEDName lnUuid',
						'LNode lnUuid',
						'KDC apUuid',
						'ServerAt apUuid',
					],
				},
			},
		'P2 logical device renamed -> one lookup per referrer tag and uuid attribute, no tag read': {
			sourceXml: subscription,
			rename: { tagName: 'LDevice', id: 'p2-ld', attributes: { inst: 'LD5' } },
			expected: {
				tagReads: [],
				lookups: [
					'Association lnUuid',
					'ClientLN lnUuid',
					'ExtCtrl lnUuid',
					'ExtRef lnUuid',
					'ExtRef srcCBUuid',
					'FCDA lnUuid',
					'GSE cbUuid',
					'IEDName ldUuid',
					'IEDName lnUuid',
					'LNode lnUuid',
				],
			},
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const { tagName, id: recordId, attributes } = testCase.rename
			const ref = { tagName, id: recordId } as Scl.Ref<Scl.ElementsOf>
			// the reads of the hook, on the document: no referrer written yet (the operations are not looked at)
			const stored = await source.query.getRecord(ref)
			if (!stored) throw new Error(`no ${ref.tagName} ${ref.id} in the fixture`)
			const oldRecord = toRawRecord(stored) as Scl.RawRecord<Scl.ElementsOf>
			const newRecord: Scl.RawRecord<Scl.ElementsOf> = {
				...oldRecord,
				attributes: oldRecord.attributes.map((attribute) =>
					attribute.name in attributes
						? { ...attribute, value: attributes[attribute.name] }
						: attribute,
				),
			}
			const { query, calls } = countDocumentQueryReads(source.query)
			await followTupleTargetRename(query, { oldRecord, newRecord })
			const tagReads = calls().flatMap((call) =>
				call.method === 'getRecordsByTagName' ? [String(call.args[0])] : [],
			)
			const lookups = calls().flatMap((call) =>
				call.method === 'findByAttributes' ? [describeLookup(call.args[0])] : [],
			)
			expect({ tagReads, lookups }).toEqual(testCase.expected)
		},
	})
})

function describeLookup(filter: unknown): string {
	const { tagName, attributes } = filter as { tagName: string; attributes: Record<string, unknown> }
	return `${tagName} ${Object.keys(attributes).join(',')}`
}
