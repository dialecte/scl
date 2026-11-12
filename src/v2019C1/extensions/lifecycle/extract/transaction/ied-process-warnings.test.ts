/// <reference types="vite/client" />

import BehaviourOnAnLnodeOfBXml from './fixtures/behaviour-on-an-lnode-of-b.xml?raw'
import BehaviourOnLnodesOfAAndBAWithOneLnXml from './fixtures/behaviour-on-lnodes-of-a-and-b-a-with-one-ln.xml?raw'
import InputOfAWithAnIdFedByAnLnodeOfBXml from './fixtures/input-of-a-with-an-id-fed-by-an-lnode-of-b.xml?raw'
import LnodesOfAOnXcbrAndLgosXml from './fixtures/lnodes-of-a-on-xcbr-and-lgos.xml?raw'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { ExtractWarning } from './extract.types'
import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseXmlTestCase & { expectedWarnings: ExtractWarning[] }

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const emptyIsd = /* xml */ `<SCL ${ns} ${id}="empty-isd"/>`

const EXPORT = {
	iedRef: { tagName: 'IED', id: 'ied-a' },
	fileType: 'ISD',
	kind: 'instance',
	inputs: 'none',
	issuer: 'TEST_ISSUER',
	tool: 'TEST',
	who: 'engineer',
} as const

async function act({ source, target, testCase }: SclTest.ActParams<TestCase>): Promise<void> {
	if (!target) throw new Error('target required')
	const { warnings } = await target.transaction(async function exportIsd(tx) {
		return tx.lifecycle.extract.ied({ ...EXPORT, sourceQuery: source.query })
	})
	expect(warnings).toEqual(testCase.expectedWarnings)
}

describe('what the process part leaves out or cuts is listed', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'LNode of A mapped to its LGOS → the LGOS and the LNode listed': {
			sourceXml: LnodesOfAOnXcbrAndLgosXml,
			targetXml: emptyIsd,
			expectedWarnings: [
				{ code: 'supervision-left-out', source: { tagName: 'LN', id: 'supervision-ln' } },
				{
					code: 'process-lnode-left-out',
					source: { tagName: 'LNode', id: 'supervision-lnode' },
					reason: 'target-not-carried',
				},
			],
		},
		'behaviour description of F2 on an LNode of A and one of B → listed as partly mapped': {
			sourceXml: BehaviourOnLnodesOfAAndBAWithOneLnXml,
			targetXml: emptyIsd,
			expectedWarnings: [
				{
					code: 'behavior-description-left-out',
					source: { tagName: 'BehaviorDescription', id: 'behaviour-across-a-b' },
					reason: 'partly-mapped',
				},
			],
		},
		'behaviour description of F2 on the LNode of B only → not listed': {
			sourceXml: BehaviourOnAnLnodeOfBXml,
			targetXml: emptyIsd,
			expectedWarnings: [],
		},
		'input of the LNode of A fed by the LNode of B → the input listed with the attributes cleared':
			{
				sourceXml: InputOfAWithAnIdFedByAnLnodeOfBXml,
				targetXml: emptyIsd,
				expectedWarnings: [
					{
						code: 'process-reference-cut',
						source: { tagName: 'SourceRef', id: 'input-fed-by-b' },
						attributes: ['source', 'sourceDaName', 'sourceDoName', 'sourceLNodeUuid'],
					},
				],
			},
	}

	runSclTestCases.withoutExport({ testCases, act })
})
