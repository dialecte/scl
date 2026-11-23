import { runBuildIedCases, runBuildIedRefusalCases } from './__tests__/build-ied-cases'
import base from './fixtures/build-ied/base.xml?raw'
import lnNames from './fixtures/build-ied/ln-names.xml?raw'
import longLeafSubFunction from './fixtures/build-ied/long-leaf-subfunction.xml?raw'
import twoLln0 from './fixtures/build-ied/two-lln0.xml?raw'
import twoPtoc1 from './fixtures/build-ied/two-ptoc1.xml?raw'

import { describe } from 'vitest'

import type { BuildIedRefusalCase, BuildIedTestCase } from './__tests__/build-ied-cases'
import type { SclTest } from '@/v2019C1/test'

/** The LDevice PROT of S. */
const PROT = '//default:IED[@name="S"]//default:LDevice[@inst="PROT"]'

/** The prefix a leaf subfunction gives, on request. */
describe('buildIed - prefixes from leaf subfunctions', () => {
	const testCases: SclTest.TestCases<BuildIedTestCase> = {
		'prefixFromLeafSubFunction: PTOC1 in leaf I, PTRC1 in leaf TRIP → prefixes I and TRIP, bound': {
			sourceXml: base,
			lnodes: ['lln0', 'ptoc1', 'ptrc1'],
			prefixFromLeafSubFunction: true,
			created: { lDevices: 1, logicalNodes: 4 },
			openValuesUsed: [{ point: 'lnType', element: 'q01-prot', value: 'LPHD_T' }],
			expectedQueries: [
				`${PROT}/default:LN[@prefix="I"][@lnClass="PTOC"][@inst="1"]`,
				`${PROT}/default:LN[@prefix="TRIP"][@lnClass="PTRC"][@inst="1"]`,
				`//default:LNode[@prefix="I"][@lnClass="PTOC"][@lnUuid=${PROT}/default:LN[@prefix="I"]/@uuid]`,
			],
		},
		'no option: PTOC1 in leaf I → no prefix': {
			sourceXml: base,
			lnodes: ['ptoc1'],
			created: { lDevices: 1, logicalNodes: 3 },
			openValuesUsed: [
				{ point: 'lnType', element: 'q01-prot', value: 'LLN0_T' },
				{ point: 'lnType', element: 'q01-prot', value: 'LPHD_T' },
			],
			expectedQueries: [`${PROT}/default:LN[@lnClass="PTOC"]`],
			unexpectedQueries: [`${PROT}/default:LN[@prefix="I"]`],
		},
	}

	runBuildIedCases({ testCases })
})

/** Logical node names and identities the build refuses. */
describe('buildIed - logical node names refused', () => {
	const testCases: SclTest.TestCases<BuildIedRefusalCase> = {
		'prefixFromLeafSubFunction, leaf ABCDEFGHIJ, PTOC1 → ln-name, prefix lnClass lnInst over 13': {
			sourceXml: longLeafSubFunction,
			lnodes: ['ptoc1'],
			prefixFromLeafSubFunction: true,
			refusals: [{ reason: 'ln-name', ref: 'ptoc1' }],
		},
		'PTOC LNode without lnInst → ln-name': {
			sourceXml: lnNames,
			lnodes: ['no-inst'],
			refusals: [{ reason: 'ln-name', ref: 'no-inst' }],
		},
		'prefix ABCDEFGHIJ and lnInst 123 → ln-name, prefix and lnInst over 12': {
			sourceXml: lnNames,
			lnodes: ['long-prefix'],
			refusals: [{ reason: 'ln-name', ref: 'long-prefix' }],
		},
		'LLN0 LNode with prefix X → ln-name': {
			sourceXml: lnNames,
			lnodes: ['lln0-prefixed'],
			refusals: [{ reason: 'ln-name', ref: 'lln0-prefixed' }],
		},
		'two PTOC1 LNodes in PROT → ln-collision for the second': {
			sourceXml: twoPtoc1,
			lnodes: ['ptoc1', 'ptoc1-bis'],
			refusals: [{ reason: 'ln-collision', ref: 'ptoc1-bis' }],
		},
		'two LLN0 LNodes in PROT → ln-collision for the second': {
			sourceXml: twoLln0,
			lnodes: ['lln0', 'lln0-bis'],
			refusals: [{ reason: 'ln-collision', ref: 'lln0-bis' }],
		},
	}

	runBuildIedRefusalCases({ testCases })
})
