/// <reference types="vite/client" />
import { describe } from 'vitest'

import { cleanUp } from '@/v2019C1/extensions/clean-up'
import { runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

/** The fixtures of this file, whole documents read as they are. */
const FIXTURES: Readonly<Record<string, string>> = import.meta.glob<string>('./fixtures/*.xml', {
	query: '?raw',
	import: 'default',
	eager: true,
})

/** P1 deleted: the breaker back on the specification IED's XCBR1, its data named there by default, so in no word. */
const releasedWithItsDataByDefault: SclTest.BaseXmlTestCase = {
	sourceXml: FIXTURES['./fixtures/lnode-data-on-its-specification.xml'],
	expectedQueries: [
		'//default:LNode[@uuid="breaker-uuid"][@iedName="S_IED"][@lnUuid="s-breaker-uuid"]//v2019C1:DOS[@name="Beh"][not(@mappedDoName)][not(@mappedLnUuid)]',
	],
}

describe('the commit stores the data of an LNode it released in its canonical form', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'the real IED deleted, a DOS naming the specification logical node explicitly -> named by default':
			releasedWithItsDataByDefault,
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function deleteTheDevice(tx) {
			await tx.any.delete({ tagName: 'IED', id: 'p1' })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('a release in the transaction leaves the same document as the commit release', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'the real IED deleted, then the LNodes reset in the transaction -> the same document':
			releasedWithItsDataByDefault,
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function deleteTheDeviceThenReset(tx) {
			await tx.any.delete({ tagName: 'IED', id: 'p1' })
			await cleanUp.transaction.resetLNode(tx)
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
