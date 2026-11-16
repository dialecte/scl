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

const boundToADevice = FIXTURES['./fixtures/lnodes-bound-to-a-device.xml']

/** The breaker LNode back on the logical node of the specification IED it is specified on. */
const breakerOnItsSpecification =
	'//default:LNode[@uuid="breaker-uuid"][@iedName="S_IED"][@ldInst="LD0"][@lnClass="XCBR"][@lnInst="1"][not(@prefix)][@lnUuid="s-breaker-uuid"]'
/** The trip LNode on no IED, named by its specified naming. */
const tripOnNoIed =
	'//default:LNode[@uuid="trip-uuid"][@iedName="None"][@lnClass="PTRC"][@lnInst="1"][not(@ldInst)][not(@lnUuid)]'

type TestCase = SclTest.BaseXmlTestCase & { deleted: Scl.Ref<Scl.ElementsOf>[] }

describe('the commit releases the LNodes bound to a logical node the transaction deleted', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a real IED deleted, the specification IED kept -> its LNodes back to their specification': {
			sourceXml: boundToADevice,
			deleted: [{ tagName: 'IED', id: 'p1' }],
			expectedQueries: [breakerOnItsSpecification, tripOnNoIed],
			unexpectedQueries: ['//default:LNode[@iedName="P1"]'],
		},
		'the real IED and the specification IED deleted -> the LNodes on no IED': {
			sourceXml: boundToADevice,
			deleted: [
				{ tagName: 'IED', id: 'p1' },
				{ tagName: 'IED', id: 's-ied' },
			],
			expectedQueries: [
				'//default:LNode[@uuid="breaker-uuid"][@iedName="None"][@ldInst="LD0"][@lnClass="XCBR"][@lnInst="1"][not(@lnUuid)]',
				tripOnNoIed,
			],
		},
		'a logical node deleted alone -> the LNode bound to it by uuid released, the other left': {
			sourceXml: boundToADevice,
			deleted: [{ tagName: 'LN', id: 'p1-breaker' }],
			expectedQueries: [
				breakerOnItsSpecification,
				'//default:LNode[@uuid="trip-uuid"][@iedName="P1"][@ldInst="LD0"][@lnClass="PTRC"][@lnInst="1"]',
			],
		},
		'a logical node deleted alone -> the LNode bound to it by its names only released, the other left':
			{
				sourceXml: boundToADevice,
				deleted: [{ tagName: 'LN', id: 'p1-trip' }],
				expectedQueries: [
					tripOnNoIed,
					'//default:LNode[@uuid="breaker-uuid"][@iedName="P1"][@prefix="Q0"][@lnInst="2"][@lnUuid="p1-breaker-uuid"]',
				],
			},
	}

	async function act({
		source,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function deleteTheLogicalNodes(tx) {
			for (const ref of testCase.deleted) await tx.any.delete(ref)
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})

describe('the commit leaves bound an LNode whose logical node the transaction deleted and created again', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'a logical node deleted, then created again with its uuid -> the LNode stays bound to it': {
			sourceXml: boundToADevice,
			expectedQueries: [
				'//default:LNode[@uuid="breaker-uuid"][@iedName="P1"][@prefix="Q0"][@lnInst="2"][@lnUuid="p1-breaker-uuid"]',
			],
		},
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function replaceTheBreaker(tx) {
			await tx.any.delete({ tagName: 'LN', id: 'p1-breaker' })
			await tx.addChild({ tagName: 'LDevice', id: 'p1-ld' } as Scl.Ref<'LDevice'>, {
				tagName: 'LN',
				attributes: {
					prefix: 'Q0',
					lnClass: 'XCBR',
					inst: '2',
					lnType: 'XCBR_T',
					uuid: 'p1-breaker-uuid',
				},
			})
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
