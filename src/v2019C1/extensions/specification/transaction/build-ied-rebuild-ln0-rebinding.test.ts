import { sameClassInTargetIed } from '../build/open-value-rules'
import { ROLE_LNODES, runRebuildCases } from './__tests__/rebuild-cases'
import { buildIed } from './build-ied'
import rebuildRederiveIntoExistingRetypedValues from './fixtures/rebuild/rebuild-rederive-into-existing-retyped-values.xml?raw'
import rebuildRederiveTwoOntoOneLn0 from './fixtures/rebuild/rebuild-rederive-two-onto-one-ln0.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { RebuildTestCase } from './__tests__/rebuild-cases'
import type { SclTest } from '@/v2019C1/test'

const S_IED = '//default:IED[@name="S"]'
const PRT_LN0 = `${S_IED}//default:LDevice[@inst="PRT"]/default:LN0`

/** The LN0 an LLN0 LNode is re-derived onto: its held values judged against the type it takes. */
describe('buildIed - the values of an existing LN0 an LLN0 LNode is re-derived onto', () => {
	const testCases: SclTest.TestCases<RebuildTestCase> = {
		'PRT’s LN0 holds Beh 1 and Health, the LLN0 LNode typed LLN0_T2 (no Health) specifies Beh 2 → Health removed, Beh changed':
			{
				// rebuild-rederive-into-existing-retyped-values: LD PRT built already, its LN0 holding Beh.stVal 1 and Health.stVal
				sourceXml: rebuildRederiveIntoExistingRetypedValues,
				lnodes: ROLE_LNODES,
				rederiveLDevices: true,
				report: {
					moved: [
						{ ln: 'ln-ptoc1', fromLd: 'PROT', toLd: 'PRT' },
						{ ln: 'ln-ptrc1', fromLd: 'PROT', toLd: 'PRT' },
					],
					retyped: [
						{ ln: 'ln-prt-lln0', from: 'LLN0_T', to: 'LLN0_T2', valuesRemoved: ['dai-prt-health'] },
					],
					removed: { logicalNodes: [], lDevices: ['ld-prot'] },
					values: { added: 0, changed: 1 },
				},
				expectedQueries: [
					`${PRT_LN0}[@lnType="LLN0_T2"]/default:DOI[@name="Beh"]/default:DAI[@name="stVal"]/default:Val[.="2"]`,
				],
				unexpectedQueries: [`${PRT_LN0}/default:DOI[@name="Health"]`],
			},
	}

	runRebuildCases({ testCases })
})

/** Two LNodes of one run never take one LN0. */
describe('buildIed - two LLN0 LNodes re-derived onto one LN0', () => {
	type TestCase = SclTest.BaseXmlTestCase & { lnodes: string[] }

	const testCases: SclTest.TestCases<TestCase> = {
		'the LLN0 LNode of PRT and the one of its subfunction I, both re-derived to PRT → ln-collision, nothing written':
			{
				// rebuild-rederive-two-onto-one-ln0: lln0-i, in subfunction I of PRT, bound to CTRL’s LN0
				sourceXml: rebuildRederiveTwoOntoOneLn0,
				lnodes: [...ROLE_LNODES, 'lln0-i'],
				expectedQueries: [`${S_IED}//default:LDevice[@inst="PROT"]/default:LN[@lnClass="PTOC"]`],
			},
	}

	runSclTestCases.withExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const refused = await source
				.transaction((tx) =>
					buildIed(tx, {
						ied: { tagName: 'IED', id: 'ied-s' },
						lnodes: testCase.lnodes.map((id) => ({ tagName: 'LNode' as const, id })),
						openValues: { lnType: sameClassInTargetIed },
						rederiveLDevices: true,
					}),
				)
				.then(
					() => undefined,
					(error: unknown) => error,
				)
			const reported = toDialecteError(refused)
			const reasons = ((reported?.meta as { refusals?: { reason: string }[] })?.refusals ?? []).map(
				(refusal) => refusal.reason,
			)
			expect({ key: reported?.key, reasons }).toMatchObject({
				key: 'SPECIFICATION_BUILD_REFUSED',
				reasons: expect.arrayContaining(['ln-collision']),
			})
		},
	})
})
