import { sameClassInTargetIed } from '../build/open-value-rules'
import { buildIed } from './build-ied'
import contextClashBuildDocument from './fixtures/build-ied/context-clash-build-document.xml?raw'
import contextClashProject from './fixtures/build-ied/context-clash-project.xml?raw'
import contextDedupBuildDocument from './fixtures/build-ied/context-dedup-build-document.xml?raw'
import contextProject from './fixtures/build-ied/context-project.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { LnTypeContext } from './build-ied.types'
import type { SclTest } from '@/v2019C1/test'

/** `lnType` rule: the context's LLN0_P and LPHD_P. */
function contextTypes(context: LnTypeContext): string | undefined {
	return { LLN0: 'LLN0_P', LPHD: 'LPHD_P' }[context.lnClass]
}

/** A build in the target with the source as its context document. */
describe('buildIed - the context document', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		rule: (context: LnTypeContext) => string | undefined
		/** The logical device and the LN0 / LPHD types the result's plan reports. */
		planned: { lDevices: string[]; added: string[] }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'LLN0_P picked from the context, equal to the target’s LLN0_T → LN0 typed LLN0_T, the plan names LLN0_T':
			{
				sourceXml: contextProject,
				targetXml: contextDedupBuildDocument,
				rule: contextTypes,
				planned: { lDevices: ['PROT'], added: ['LLN0_T', 'LPHD_T'] },
				expectedQueries: [
					'//default:IED[@name="S"]//default:LDevice[@inst="PROT"]/default:LN0[@lnType="LLN0_T"]',
				],
				unexpectedQueries: [
					'//default:LNodeType[@id="LLN0_P"]',
					'//default:LNodeType[@id="LPHD_P"]',
				],
			},
		'PROT in Q01 of the target and in Q01 and Q02 of the context → LD Q01_PROT, the context decides the clash':
			{
				sourceXml: contextClashProject,
				targetXml: contextClashBuildDocument,
				rule: sameClassInTargetIed,
				planned: { lDevices: ['Q01_PROT'], added: ['LLN0_T', 'LPHD_T'] },
				expectedQueries: [
					'//default:IED[@name="S"]//default:LDevice[@inst="Q01_PROT"]/default:LN[@lnClass="PTOC"]',
				],
				unexpectedQueries: ['//default:LDevice[@inst="PROT"]'],
			},
	}

	runSclTestCases.withExport<TestCase>({
		testCases,
		act: async ({ source, target, testCase }) => {
			const built = target?.transaction((tx) =>
				buildIed(tx, {
					ied: { tagName: 'IED', id: 'ied-s' },
					lnodes: [{ tagName: 'LNode', id: 'ptoc1' }],
					openValues: { lnType: testCase.rule },
					contextQuery: source.query,
				}),
			)
			await expect(
				Promise.resolve(built).then((result) => ({
					lDevices: result?.plan.lDevices.map((lDevice) => lDevice.inst),
					added: result?.plan.added.map((addition) => addition.lnType),
				})),
			).resolves.toEqual(testCase.planned)
			return { assertOn: 'target' }
		},
	})
})
