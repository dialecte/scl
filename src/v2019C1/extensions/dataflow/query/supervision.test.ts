import { all } from './all'
import edgeCasesXml from './fixtures/supervision-edge-cases.xml?raw'
import matchesXml from './fixtures/supervision-matches.xml?raw'
import formsXml from './fixtures/supervision-reference-forms.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Supervision } from '../dataflow.types'
import type { Config } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

/** The supervision found through the LGOS / LSVS of the given number in the fixture's IED `B1` (`C1` for `c1`, AP2 for `ap`). */
function supervisionBy(lgos: string): Supervision {
	return {
		ln: { tagName: 'LN', id: lgos },
		doi: { tagName: 'DOI', id: `doi-${lgos}` },
		dai: { tagName: 'DAI', id: `dai-${lgos}` },
		val: { tagName: 'Val', id: `val-${lgos}` },
	}
}

/** The supervision `all()` gives the dataflow of the ExtRef. */
async function supervisionOfExtRef(params: {
	query: Core.Query<Config>
	extRef: string
}): Promise<Supervision | undefined> {
	const { query, extRef } = params
	const dataflows = await all(query)
	const dataflow = dataflows.find(({ implementation }) => implementation.element?.id === extRef)
	expect(dataflow, `a dataflow of ${extRef}`).toBeDefined()
	return dataflow?.implementation.supervision
}

/** P1 publishes gcb1, gcb3, gcb11, svcb1 (LD0), gcb12, gcb13 (LD2 and its LN0 with uuids) and gcb2, gcb7 (LD1, ldName FUNC1); B1 publishes gcbB and holds an LGOS per reference form and an LSVS. */
const FORMS = { sourceXml: formsXml }

/** P1 publishes rcb1, gcb4..gcb10; B1 holds LGOS 4..9 (misnamed DOI and DAI, two naming gcb8, two Vals) and an LGOS on its access point AP2; C1 holds the LGOS naming gcb5. */
const MATCHES = {
	sourceXml: matchesXml,
	allowIncoherentReferences:
		'an ExtRef of service SMV naming a GSEControl by uuid: the control block tells the service',
}

/** P1 publishes gcbE, gcbF; B1 holds LGOS naming gcbE and a control block P1 lacks, an LN0 of class LGOS naming gcbF. */
const EDGE_CASES = {
	sourceXml: edgeCasesXml,
	allowIncoherentReferences: 'an ExtRef naming a control block the document lacks: no supervision',
}

/**
 * The supervision of a dataflow: the LGOS (GOOSE) or LSVS (SMV) logical node of the subscriber IED holding a
 * `setSrcRef` value that names the dataflow's control block, in one of the forms a reference takes.
 */
describe('dataflow supervision', () => {
	type TestCase = SclTest.BaseXmlTestCase & { extRef: string; expected: Supervision | undefined }

	const testCases: SclTest.TestCases<TestCase> = {
		'GOOSE control block named by IED name and inst → its LGOS': {
			...FORMS,
			extRef: 'ext-gcb1',
			expected: supervisionBy('lgos-1'),
		},
		'SMV control block → its LSVS': {
			...FORMS,
			extRef: 'ext-svcb1',
			expected: supervisionBy('lsvs-1'),
		},
		'logical device with an ldName, the value naming it by ldName → its LGOS': {
			...FORMS,
			extRef: 'ext-gcb2-ldname',
			expected: supervisionBy('lgos-2'),
		},
		'logical device with an ldName, the value naming it by IED name and inst → its LGOS': {
			...FORMS,
			extRef: 'ext-gcb7-default-form',
			expected: supervisionBy('lgos-10'),
		},
		'the value naming the control block by #UID and its uuid (the ExtRef naming it by uuid only) → its LGOS':
			{
				...FORMS,
				extRef: 'ext-gcb3-uuid-only',
				expected: supervisionBy('lgos-3'),
			},
		'control block of the subscriber IED, the value relative with @ → its LGOS': {
			...FORMS,
			extRef: 'ext-gcbb-relative',
			expected: supervisionBy('lgos-11'),
		},
		'control block of another IED, the value relative with @ → none': {
			...FORMS,
			extRef: 'ext-gcb11-relative-other-ied',
			expected: undefined,
		},
		'a GSEControl named by uuid only, serviceType SMV → its LGOS: the control block tells the service':
			{
				...MATCHES,
				extRef: 'ext-gcb4-service-disagrees',
				expected: supervisionBy('lgos-4'),
			},
		'the only LGOS naming the control block in another IED → none': {
			...MATCHES,
			extRef: 'ext-gcb5-other-ied',
			expected: undefined,
		},
		'the DOI misnamed in one LGOS, the DAI misnamed in another → none': {
			...MATCHES,
			extRef: 'ext-gcb6-misnamed',
			expected: undefined,
		},
		'two LGOS naming the control block → the first in document order': {
			...MATCHES,
			extRef: 'ext-gcb8-two-supervisions',
			expected: supervisionBy('lgos-7'),
		},
		'the second Val of the setSrcRef naming the control block → that Val': {
			...MATCHES,
			extRef: 'ext-gcb9-second-val',
			expected: { ...supervisionBy('lgos-9'), val: { tagName: 'Val', id: 'val-lgos-9-b' } },
		},
		'ExtRef and LGOS held by an access point without server → its LGOS': {
			...MATCHES,
			extRef: 'ext-gcb10-access-point',
			expected: supervisionBy('lgos-ap'),
		},
		'a logical device with a uuid, the value naming the control block by #UID of it → its LGOS': {
			...FORMS,
			extRef: 'ext-gcb12-ldevice-uuid',
			expected: supervisionBy('lgos-13'),
		},
		'an LN0 with a uuid, the value naming the control block by #UID of it → its LGOS': {
			...FORMS,
			extRef: 'ext-gcb13-ln0-uuid',
			expected: supervisionBy('lgos-14'),
		},
		'an ExtRef without serviceType, its control block named by names → its LGOS': {
			...EDGE_CASES,
			extRef: 'ext-without-service',
			expected: supervisionBy('lgos-e'),
		},
		'an ExtRef naming a control block the document lacks, an LGOS naming it by text → none': {
			...EDGE_CASES,
			extRef: 'ext-dangling',
			expected: undefined,
		},
		'an LN0 of class LGOS naming the control block → none: an LN supervises': {
			...EDGE_CASES,
			extRef: 'ext-gcbf-ln0-lgos',
			expected: undefined,
		},
		'report control block → none': {
			...MATCHES,
			extRef: 'ext-rcb1-report',
			expected: undefined,
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const supervision = await supervisionOfExtRef({
				query: source.query,
				extRef: testCase.extRef,
			})
			expect(supervision).toEqual(testCase.expected)
		},
	})
})

/** Inside a transaction the supervision is read from the staged state. */
describe('dataflow supervision - inside a transaction', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		extRef: string
		/** Staged before the call, in the transaction it runs in. */
		stage: (tx: Core.Transaction<Config>) => Promise<void>
		expected: Supervision | undefined
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'the supervising Val deleted → none': {
			...FORMS,
			extRef: 'ext-gcb1',
			stage: async (tx) => {
				await tx.delete({ tagName: 'Val', id: 'val-lgos-1' })
			},
			expected: undefined,
		},
		'the DOI of the first of two supervisions deleted → the second': {
			...MATCHES,
			extRef: 'ext-gcb8-two-supervisions',
			stage: async (tx) => {
				await tx.delete({ tagName: 'DOI', id: 'doi-lgos-7' })
			},
			expected: supervisionBy('lgos-8'),
		},
		'a DOI, DAI and Val naming the control block added → the staged elements': {
			...MATCHES,
			extRef: 'ext-gcb6-misnamed',
			stage: async (tx) => {
				const doi = await tx.addChild(
					{ tagName: 'LN', id: 'lgos-5' },
					{
						id: '00000000-0000-0000-0000-00000000d001',
						tagName: 'DOI',
						attributes: { name: 'GoCBRef' },
					},
				)
				const dai = await tx.addChild(doi, {
					id: '00000000-0000-0000-0000-00000000da01',
					tagName: 'DAI',
					attributes: { name: 'setSrcRef' },
				})
				await tx.addChild(dai, {
					id: '00000000-0000-0000-0000-0000000000a1',
					tagName: 'Val',
					value: 'P1LD0/LLN0.gcb6',
				})
			},
			expected: {
				ln: { tagName: 'LN', id: 'lgos-5' },
				doi: { tagName: 'DOI', id: '00000000-0000-0000-0000-00000000d001' },
				dai: { tagName: 'DAI', id: '00000000-0000-0000-0000-00000000da01' },
				val: { tagName: 'Val', id: '00000000-0000-0000-0000-0000000000a1' },
			},
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const supervision = await source.transaction(async (tx) => {
				await testCase.stage(tx)
				return supervisionOfExtRef({ query: tx, extRef: testCase.extRef })
			})
			expect(supervision).toEqual(testCase.expected)
		},
	})
})
