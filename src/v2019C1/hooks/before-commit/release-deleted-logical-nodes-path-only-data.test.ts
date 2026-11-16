/// <reference types="vite/client" />
import { describe } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { releaseLNodeBinding } from '@/v2019C1/extensions/data-model/transaction/release-lnode-binding'
import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

/** The fixtures of this file, whole documents read as they are. */
const FIXTURES: Readonly<Record<string, string>> = import.meta.glob<string>('./fixtures/*.xml', {
	query: '?raw',
	import: 'default',
	eager: true,
})

const trip = { tagName: 'LNode', id: 'trip' } as Scl.Ref<'LNode'>

/** P1's PTRC1 deleted, then a DOS of the trip LNode written naming its data by path only: nothing resolves it then. */
async function deleteThenWritePathOnlyData(tx: Core.Transaction<Config>): Promise<void> {
	await tx.any.delete({ tagName: 'LN', id: 'p1-trip' })
	// written on the LNode, it lands in the LNode's Private
	await tx.addChild(trip, {
		tagName: 'DOS',
		namespace: SCL_DIALECTE_CONFIG.namespaces.v2019C1,
		attributes: { name: 'Health', mappedDoName: 'Beh' },
	})
}

/** The trip back on the specification IED's PTRC1, its data named there in full: path and logical node uuid. */
const releasedWithItsPathOnlyDataStored: SclTest.BaseXmlTestCase = {
	sourceXml: FIXTURES['./fixtures/lnode-trip-specified-on-a-specification-ied.xml'],
	expectedQueries: [
		'//default:LNode[@uuid="trip-uuid"][@iedName="S_IED"][@lnUuid="s-trip-uuid"]//v2019C1:DOS[@name="Health"][@mappedDoName="Beh"][@mappedLnUuid="s-trip-uuid"]',
	],
}

describe('the commit stores data its released LNode names by path only in its canonical form', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'a logical node deleted, a DOS written by path only, the commit release -> path and uuid stored':
			releasedWithItsPathOnlyDataStored,
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await source.transaction(deleteThenWritePathOnlyData)
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('a release in the transaction stores the same path-only data', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'a logical node deleted, a DOS written by path only, the LNode released in the transaction -> the same document':
			releasedWithItsPathOnlyDataStored,
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function deleteWriteThenRelease(tx) {
			await deleteThenWritePathOnlyData(tx)
			await releaseLNodeBinding(tx, { lnode: trip })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
