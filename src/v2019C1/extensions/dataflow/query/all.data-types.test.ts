import { all } from './all'
import dataPathsThroughTypesXml from './fixtures/data-paths-through-types.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { SpecifiedDataflow } from '../dataflow.types'
import type { SclTest } from '@/v2019C1/test'

/** The other side of a specified dataflow, keyed by its signal's id. */
type OtherBySignal = Readonly<Record<string, SpecifiedDataflow['specification']['other']>>

const SENDER_LNODE = { tagName: 'LNode', id: 'lnode-sender' } as const

/**
 * The data a signal's source path names is split by the data types of the document: through
 * members a `Private` holds, enumerations and the values of the types, as before.
 */
describe('all - data paths split through the data types', () => {
	type TestCase = SclTest.BaseXmlTestCase & { expected: OtherBySignal }

	const testCases: SclTest.TestCases<TestCase> = {
		'paths through members held in a Private, a Struct with values, an Enum with its EnumType → split by the data types':
			{
				// eight SourceRefs with source paths: Struct DA and BDA holding Val, Enum DA of an EnumType, DOs and an SDO
				// held in a Private of their type (the import names none of those: the data types split them), a plain DA,
				// a DA the model lacks
				sourceXml: dataPathsThroughTypesXml,
				expected: {
					'source-ref-struct': { lnode: SENDER_LNODE, doName: 'PhV.phsA', daName: 'cVal.mag.f' },
					'source-ref-enum': { lnode: SENDER_LNODE, doName: 'Beh', daName: 'stVal' },
					'source-ref-private-do': {
						lnode: SENDER_LNODE,
						doName: 'Vnd',
						daName: 'general',
						dataPath: 'Vnd.general',
					},
					'source-ref-private-sdo': {
						lnode: SENDER_LNODE,
						doName: 'Pos.Oper',
						daName: 'general',
						dataPath: 'Pos.Oper.general',
					},
					'source-ref-private-enum': {
						lnode: SENDER_LNODE,
						doName: 'VndBeh',
						daName: 'stVal',
						dataPath: 'VndBeh.stVal',
					},
					'source-ref-private-struct': {
						lnode: SENDER_LNODE,
						doName: 'VndPhV.phsA',
						daName: 'cVal.mag.f',
						dataPath: 'VndPhV.phsA.cVal.mag.f',
					},
					'source-ref-plain': { lnode: SENDER_LNODE, doName: 'Op', daName: 'general' },
					'source-ref-unknown': { lnode: SENDER_LNODE, dataPath: 'Op.unknown' },
				},
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const dataflows = await all(source.query)
			const otherBySignal = Object.fromEntries(
				dataflows.flatMap((dataflow) =>
					dataflow.kind === 'specified' ? [[dataflow.signal.id, dataflow.specification.other]] : [],
				),
			)
			expect(otherBySignal).toEqual(testCase.expected)
		},
	})
})
