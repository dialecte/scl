import { firstOfClass } from '../build/open-value-rules'
import { buildIed } from './build-ied'
import contextBuildDocument from './fixtures/build-ied/context-build-document.xml?raw'
import contextProject from './fixtures/build-ied/context-project.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

/** The LDevice PROT of S. */
const PROT = '//default:IED[@name="S"]//default:LDevice[@inst="PROT"]'

/**
 * A build in one document (the target) with another as its context (the source): a type the rule picks from the
 * context alone is imported into the document built in.
 */
describe('buildIed - a type only the context document holds', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		openValuesUsed: { point: string; element: string; value: string }[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'LN0 and LPHD types only in the context, rule firstOfClass → LLN0_P and LPHD_P imported and used':
			{
				sourceXml: contextProject,
				targetXml: contextBuildDocument,
				openValuesUsed: [
					{ point: 'lnType', element: 'q01-prot', value: 'LLN0_P' },
					{ point: 'lnType', element: 'q01-prot', value: 'LPHD_P' },
				],
				expectedQueries: [
					`${PROT}/default:LN0[@lnType="LLN0_P"]`,
					`${PROT}/default:LN[@lnClass="LPHD"][@lnType="LPHD_P"]`,
					`${PROT}/default:LN[@lnClass="PTOC"][@lnType="PTOC_T"]`,
					'//default:DataTypeTemplates/default:LNodeType[@id="LLN0_P"][@lnClass="LLN0"]',
					'//default:DataTypeTemplates/default:LNodeType[@id="LPHD_P"][@lnClass="LPHD"]',
				],
				unexpectedQueries: ['//default:LNodeType[@id="PTOC_T"][2]'],
			},
	}

	runSclTestCases.withExport<TestCase>({
		testCases,
		act: async ({ source, target, testCase }) => {
			const built = target?.transaction((tx) =>
				buildIed(tx, {
					ied: { tagName: 'IED', id: 'ied-s' },
					lnodes: [{ tagName: 'LNode', id: 'ptoc1' }],
					openValues: { lnType: firstOfClass },
					contextQuery: source.query,
				}),
			)
			await expect(
				Promise.resolve(built).then((result) =>
					result?.plan.openValuesUsed.map((used) => ({ ...used, element: used.element.id })),
				),
			).resolves.toEqual(testCase.openValuesUsed)
			return { assertOn: 'target' }
		},
	})
})
