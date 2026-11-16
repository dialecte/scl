/// <reference types="vite/client" />
import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

/** The fixtures of this file, whole documents read as they are. */
const FIXTURES: Readonly<Record<string, string>> = import.meta.glob<string>('./fixtures/*.xml', {
	query: '?raw',
	import: 'default',
	eager: true,
})

describe('the commit releases an LNode bound to a logical node the transaction created and deleted', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'a logical node created, an LNode bound to it, the logical node deleted -> the LNode on no IED':
			{
				sourceXml: FIXTURES['./fixtures/lnodes-bound-to-a-device.xml'],
				expectedQueries: [
					'//default:LNode[@uuid="trip-uuid"][@iedName="None"][@lnClass="PTRC"][@lnInst="1"][not(@ldInst)][not(@lnUuid)]',
				],
			},
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function createBindDelete(tx) {
			const created = await tx.addChild({ tagName: 'LDevice', id: 'p1-ld' } as Scl.Ref<'LDevice'>, {
				tagName: 'LN',
				attributes: { lnClass: 'PTRC', inst: '9', lnType: 'PTRC_T', uuid: 'created-ln-uuid' },
			})
			await tx.update(
				{ tagName: 'LNode', id: 'trip' },
				{ attributes: { lnUuid: 'created-ln-uuid' } },
			)
			await tx.any.delete(created)
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
