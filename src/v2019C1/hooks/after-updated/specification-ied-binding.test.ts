/// <reference types="vite/client" />
import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/** The fixtures of this file, whole documents read as they are. */
const FIXTURES: Readonly<Record<string, string>> = import.meta.glob<string>('./fixtures/*.xml', {
	query: '?raw',
	import: 'default',
	eager: true,
})

const project = FIXTURES['./fixtures/lnodes-specified-on-a-specification-ied.xml']

describe('an LNode keeps the specification IED it is specified on', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		update: { lnode: string; attributes: Record<string, string | undefined> }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		"an LNode on no IED is bound to a specification IED's logical node -> it is specified on that IED, its logical node naming kept":
			{
				sourceXml: project,
				update: { lnode: 'lnode-free', attributes: { lnUuid: 's1-ptoc-uuid' } },
				expectedQueries: [
					'//default:LNode[@uuid="lnode-free-uuid"][@iedName="S1"][@ldInst="CTRL"]//v2019C1:LNodeSpecNaming[@sIedName="S1"][@sLdInst="CTRL"][@sLnClass="PTOC"][@sLnInst="1"]',
				],
			},

		'an LNode bound to a real IED and specified on a specification IED holding its logical node is unbound -> it goes back to that IED and logical node':
			{
				sourceXml: project,
				update: { lnode: 'lnode-real', attributes: { lnUuid: undefined } },
				expectedQueries: [
					'//default:LNode[@uuid="lnode-real-uuid"][@iedName="S1"][@ldInst="CTRL"][@lnClass="CILO"][@lnInst="1"][@lnUuid="s1-cilo-uuid"][not(@prefix)]',
					'//default:LNode[@uuid="lnode-real-uuid"]//v2019C1:LNodeSpecNaming[@sIedName="S1"]',
				],
			},

		'an LNode bound to the specification IED it is specified on is unbound -> on no IED, its specified naming kept':
			{
				sourceXml: project,
				update: { lnode: 'lnode-on-s1', attributes: { lnUuid: undefined } },
				expectedQueries: [
					'//default:LNode[@uuid="lnode-on-s1-uuid"][@iedName="None"][@ldInst="CTRL"][not(@lnUuid)]',
					'//default:LNode[@uuid="lnode-on-s1-uuid"]//v2019C1:LNodeSpecNaming[@sIedName="S1"][@sLdInst="CTRL"][@sLnClass="CSWI"]',
				],
			},

		'an LNode bound to a real IED and specified on a logical node its specification IED does not hold is unbound -> on no IED, still specified on that IED':
			{
				sourceXml: project,
				update: { lnode: 'lnode-real-unmatched', attributes: { lnUuid: undefined } },
				expectedQueries: [
					'//default:LNode[@uuid="lnode-real-unmatched-uuid"][@iedName="None"][@lnClass="XCBR"][@lnInst="9"][not(@lnUuid)]',
					'//default:LNode[@uuid="lnode-real-unmatched-uuid"]//v2019C1:LNodeSpecNaming[@sIedName="S1"]',
				],
			},

		'an LNode on no IED and specified on a specification IED is renumbered -> its specified instance follows, its specification IED kept':
			{
				sourceXml: project,
				update: { lnode: 'lnode-unassigned', attributes: { lnInst: '8' } },
				expectedQueries: [
					'//default:LNode[@uuid="lnode-unassigned-uuid"]//v2019C1:LNodeSpecNaming[@sIedName="S1"][@sLdInst="CTRL"][@sLnInst="8"]',
				],
			},

		'an LNode bound to a real IED is unbound by an update writing iedName None -> the rest of its naming back from its specified naming':
			{
				sourceXml: project,
				update: { lnode: 'lnode-real', attributes: { lnUuid: undefined, iedName: 'None' } },
				expectedQueries: [
					'//default:LNode[@uuid="lnode-real-uuid"][@iedName="None"][@ldInst="CTRL"][@lnClass="CILO"][@lnInst="1"][not(@prefix)][not(@lnUuid)]',
				],
			},
	}

	async function act({
		source,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const { lnode, attributes } = testCase.update
		await source.transaction(async (tx) => {
			await tx.update({ tagName: 'LNode', id: lnode }, { attributes })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})
