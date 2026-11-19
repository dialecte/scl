import matchesXml from './fixtures/supervision-matches.xml?raw'
import formsXml from './fixtures/supervision-reference-forms.xml?raw'
import { supervisionsOf } from './supervisions-of'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Supervision } from '../dataflow.types'
import type { SupervisionRequest } from './supervisions-of.types'
import type { Config } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

const B1 = { tagName: 'IED', id: 'ied-b1' } as const
const C1 = { tagName: 'IED', id: 'ied-c1' } as const

/** P1 publishes gcb1, gcb3, gcb11, svcb1 (LD0) and gcb2, gcb7 (LD1, ldName FUNC1); B1 publishes gcbB and holds an LGOS per reference form and an LSVS. */
const FORMS = { sourceXml: formsXml }

/** P1 publishes rcb1, gcb4..gcb10; B1 holds LGOS 4..9 (misnamed DOI and DAI, two naming gcb8, two Vals) and an LGOS on its access point AP2; C1 holds the LGOS naming gcb5. */
const MATCHES = {
	sourceXml: matchesXml,
	allowIncoherentReferences:
		'an ExtRef of service SMV naming a GSEControl by uuid: the control block tells the service',
}

/** The supervision found through the LGOS / LSVS of that id in the fixtures. */
function supervisionBy(lgos: string): Supervision {
	return {
		ln: { tagName: 'LN', id: lgos },
		doi: { tagName: 'DOI', id: `doi-${lgos}` },
		dai: { tagName: 'DAI', id: `dai-${lgos}` },
		val: { tagName: 'Val', id: `val-${lgos}` },
	}
}

type TestCase = SclTest.BaseXmlTestCase & {
	requests: readonly SupervisionRequest[]
	expected: readonly (Supervision | undefined)[]
}

/** `supervisionsOf` answers per request, in input order: the supervision of a control block in a subscriber IED. */
describe('supervisionsOf', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'requests of several control blocks and subscribers, one repeated → one answer each, in input order':
			{
				...MATCHES,
				requests: [
					{ controlBlock: { tagName: 'GSEControl', id: 'gcb5' }, subscriber: B1 },
					{ controlBlock: { tagName: 'GSEControl', id: 'gcb5' }, subscriber: C1 },
					{ controlBlock: { tagName: 'GSEControl', id: 'gcb8' }, subscriber: B1 },
					{ controlBlock: { tagName: 'GSEControl', id: 'gcb10' }, subscriber: B1 },
					{ controlBlock: { tagName: 'GSEControl', id: 'gcb8' }, subscriber: B1 },
				],
				expected: [
					undefined,
					supervisionBy('lgos-c1'),
					supervisionBy('lgos-7'),
					supervisionBy('lgos-ap'),
					supervisionBy('lgos-7'),
				],
			},
		'a sampled value and a GOOSE control block → their LSVS and LGOS': {
			...FORMS,
			requests: [
				{ controlBlock: { tagName: 'SampledValueControl', id: 'svcb1' }, subscriber: B1 },
				{ controlBlock: { tagName: 'GSEControl', id: 'gcb2' }, subscriber: B1 },
			],
			expected: [supervisionBy('lsvs-1'), supervisionBy('lgos-2')],
		},
		'a control block or a subscriber naming nothing, a tag not the control block one → none': {
			...FORMS,
			requests: [
				{ controlBlock: { tagName: 'GSEControl', id: 'gone' }, subscriber: B1 },
				{
					controlBlock: { tagName: 'GSEControl', id: 'gcb1' },
					subscriber: { tagName: 'IED', id: 'gone' },
				},
				{ controlBlock: { tagName: 'SampledValueControl', id: 'gcb1' }, subscriber: B1 },
			],
			expected: [undefined, undefined, undefined],
		},
		'no request → no answer': {
			...FORMS,
			requests: [],
			expected: [],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const supervisions = await supervisionsOf(source.query, { requests: testCase.requests })
			expect(supervisions).toEqual(testCase.expected)
		},
	})
})

/** On a transaction `supervisionsOf` reads the staged state. */
describe('supervisionsOf - inside a transaction', () => {
	type StagedTestCase = TestCase & {
		/** Staged before the call, in the transaction it runs in. */
		stage: (tx: Core.Transaction<Config>) => Promise<void>
	}

	const testCases: SclTest.TestCases<StagedTestCase> = {
		'the control block deleted, a supervising Val deleted → none for both, the others kept': {
			...MATCHES,
			requests: [
				{ controlBlock: { tagName: 'GSEControl', id: 'gcb8' }, subscriber: B1 },
				{ controlBlock: { tagName: 'GSEControl', id: 'gcb9' }, subscriber: B1 },
				{ controlBlock: { tagName: 'GSEControl', id: 'gcb10' }, subscriber: B1 },
			],
			stage: async (tx) => {
				await tx.delete({ tagName: 'GSEControl', id: 'gcb8' })
				await tx.delete({ tagName: 'Val', id: 'val-lgos-9-b' })
			},
			expected: [undefined, undefined, supervisionBy('lgos-ap')],
		},
	}

	runSclTestCases.withoutExport<StagedTestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const supervisions = await source.transaction(async (tx) => {
				await testCase.stage(tx)
				return supervisionsOf(tx, { requests: testCase.requests })
			})
			expect(supervisions).toEqual(testCase.expected)
		},
	})
})
