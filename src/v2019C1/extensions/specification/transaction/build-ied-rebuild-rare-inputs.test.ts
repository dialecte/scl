import { sameClassInTargetIed } from '../build/open-value-rules'
import { ROLE_LNODES, runRebuildCases } from './__tests__/rebuild-cases'
import { buildIed } from './build-ied'
import rebuildImplementedElsewhereRenamedBefore from './fixtures/rebuild/rebuild-implemented-elsewhere-renamed-before.xml?raw'
import rebuildImplementedElsewhere from './fixtures/rebuild/rebuild-implemented-elsewhere.xml?raw'
import rebuildRederiveIntoExistingRetyped from './fixtures/rebuild/rebuild-rederive-into-existing-retyped.xml?raw'
import rebuildRederiveOntoBoundLn0 from './fixtures/rebuild/rebuild-rederive-onto-bound-ln0.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { RebuildTestCase } from './__tests__/rebuild-cases'
import type { SclTest } from '@/v2019C1/test'

const S_IED = '//default:IED[@name="S"]'

/** An LLN0 LNode re-derived onto the LN0 of a logical device S holds already keeps its own type. */
describe('buildIed - an LLN0 LNode re-derived onto an existing LN0', () => {
	const testCases: SclTest.TestCases<RebuildTestCase> = {
		'the LLN0 LNode typed LLN0_T2, PRT’s LN0 LLN0_T, rederiveLDevices → PRT’s LN0 retyped LLN0_T2, reported on it':
			{
				// rebuild-rederive-into-existing-retyped: function PROT renamed PRT, LD PRT built already; the LLN0 LNode names LLN0_T2
				sourceXml: rebuildRederiveIntoExistingRetyped,
				lnodes: ROLE_LNODES,
				rederiveLDevices: true,
				report: {
					moved: [
						{ ln: 'ln-ptoc1', fromLd: 'PROT', toLd: 'PRT' },
						{ ln: 'ln-ptrc1', fromLd: 'PROT', toLd: 'PRT' },
					],
					retyped: [{ ln: 'ln-prt-lln0', from: 'LLN0_T', to: 'LLN0_T2', valuesRemoved: [] }],
					removed: { logicalNodes: [], lDevices: ['ld-prot'] },
				},
				expectedQueries: [
					`${S_IED}//default:LDevice[@inst="PRT"]/default:LN0[@lnType="LLN0_T2"]`,
					`//default:LNode[@lnClass="LLN0"][@lnUuid=${S_IED}//default:LDevice[@inst="PRT"]/default:LN0/@uuid]`,
				],
			},
	}

	runRebuildCases({ testCases })
})

/** Two LNodes never bind one LN0: a re-derive onto an LN0 another LNode binds is refused. */
describe('buildIed - an LLN0 LNode re-derived onto an LN0 bound already', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		expectedRefusal: { reason: string; ref: { tagName: string; id: string } }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'PRT’s LN0 bound by the LLN0 LNode of subfunction I, rederiveLDevices → ln-collision, nothing written':
			{
				// rebuild-rederive-onto-bound-ln0: LD PRT built already, its LN0 bound by lln0-prt; function PROT renamed PRT
				sourceXml: rebuildRederiveOntoBoundLn0,
				expectedRefusal: { reason: 'ln-collision', ref: { tagName: 'LNode', id: 'lln0' } },
				expectedQueries: [
					`${S_IED}//default:LDevice[@inst="PROT"]/default:LN[@lnClass="PTOC"]`,
					`//default:LNode[@lnClass="LLN0"][@lnUuid="c3000000-0000-4000-8000-000000000001"]`,
				],
			},
	}

	runSclTestCases.withExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const refused = await source
				.transaction((tx) =>
					buildIed(tx, {
						ied: { tagName: 'IED', id: 'ied-s' },
						lnodes: ROLE_LNODES.map((id) => ({ tagName: 'LNode' as const, id })),
						openValues: { lnType: sameClassInTargetIed },
						rederiveLDevices: true,
					}),
				)
				.then(
					() => undefined,
					(error: unknown) => error,
				)
			const reported = toDialecteError(refused)
			const refusals = (reported?.meta as { refusals?: { reason: string; ref?: unknown }[] })
				?.refusals
			expect({ key: reported?.key, refusals }).toMatchObject({
				key: 'SPECIFICATION_BUILD_REFUSED',
				refusals: expect.arrayContaining([expect.objectContaining(testCase.expectedRefusal)]),
			})
		},
	})
})

/** The logical nodes whose LNode a real IED implements now, wherever they sit in S. */
describe('buildIed - implemented elsewhere, whatever the scope', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		lnodes: string[]
		expected: {
			removed: string[]
			implementedElsewhere: { ln: string; lnode: string; ied: string; iedName: string }[]
		}
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'only PTRC1 given, now bound to R → S’s PTRC1 listed implemented by R, nothing removed': {
			// rebuild-implemented-elsewhere: PTRC1 bound to R’s PTRC1, its specification naming still naming S’s PTRC1
			sourceXml: rebuildImplementedElsewhere,
			lnodes: ['ptrc1'],
			expected: {
				removed: [],
				implementedElsewhere: [{ ln: 'ln-ptrc1', lnode: 'ptrc1', ied: 'ied-r', iedName: 'R' }],
			},
			expectedQueries: [`${S_IED}//default:LDevice[@inst="PROT"]/default:LN[@lnClass="PTRC"]`],
		},
		'CSWI1 and PTRC1 given, S’s PTRC1 in PROT, a logical device the run does not build → listed implemented by R':
			{
				// rebuild-implemented-elsewhere: PTRC1 bound to R’s PTRC1; CSWI1 stays bound to S in CTRL
				sourceXml: rebuildImplementedElsewhere,
				lnodes: ['cswi1', 'ptrc1'],
				expected: {
					removed: [],
					implementedElsewhere: [{ ln: 'ln-ptrc1', lnode: 'ptrc1', ied: 'ied-r', iedName: 'R' }],
				},
				expectedQueries: [`${S_IED}//default:LDevice[@inst="PROT"]/default:LN[@lnClass="PTRC"]`],
			},
		'PTRC1’s specification naming changed before the run (sLnInst 2) → not listed, S’s PTRC1 an orphan removed':
			{
				// rebuild-implemented-elsewhere-renamed-before: as rebuild-implemented-elsewhere, the naming of PTRC1 says sLnInst 2
				sourceXml: rebuildImplementedElsewhereRenamedBefore,
				lnodes: ROLE_LNODES,
				expected: { removed: ['ln-ptrc1'], implementedElsewhere: [] },
				unexpectedQueries: [`${S_IED}//default:LN[@lnClass="PTRC"]`],
			},
	}

	runSclTestCases.withExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const built = source.transaction((tx) =>
				buildIed(tx, {
					ied: { tagName: 'IED', id: 'ied-s' },
					lnodes: testCase.lnodes.map((id) => ({ tagName: 'LNode' as const, id })),
					openValues: { lnType: sameClassInTargetIed },
				}),
			)
			await expect(
				built.then(({ plan }) => ({
					removed: plan.rebuild.removed.logicalNodes.map((ln) => ln.id),
					implementedElsewhere: plan.rebuild.implementedElsewhere.map((entry) => ({
						ln: entry.ln.id,
						lnode: entry.lnode.id,
						ied: entry.ied.id,
						iedName: entry.iedName,
					})),
				})),
			).resolves.toEqual(testCase.expected)
		},
	})
})
