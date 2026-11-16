/// <reference types="vite/client" />
import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

/** The fixtures of this file, whole documents read as they are. */
const FIXTURES: Readonly<Record<string, string>> = import.meta.glob<string>('./fixtures/*.xml', {
	query: '?raw',
	import: 'default',
	eager: true,
})

describe('the commit writes again the signal addresses of an LNode it released', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'the logical node an LNode is bound to deleted -> its input names the ExtRef from no IED, in full':
			{
				sourceXml: FIXTURES['./fixtures/lnode-signal-bound-to-a-device.xml'],
				expectedQueries: [
					'//default:LNode[@uuid="trip-uuid"][@iedName="None"]//v2019C1:SourceRef[@extRefUuid="p1-trip-input-uuid"][@extRefAddr="P1/LD0/Q0GGIO1.Trip"]',
				],
			},
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function deleteTheTripLogicalNode(tx) {
			await tx.any.delete({ tagName: 'LN', id: 'p1-trip' })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
