import { sameClassInTargetIed } from '../build/open-value-rules'
import { runBuildIedRefusalCases } from './__tests__/build-ied-cases'
import { ROLE_LNODES, runRebuildCases } from './__tests__/rebuild-cases'
import { buildIed } from './build-ied'
import rebuildReclassed from './fixtures/rebuild/rebuild-reclassed.xml?raw'
import rebuildRecreated from './fixtures/rebuild/rebuild-recreated.xml?raw'
import rebuildRederiveDataset from './fixtures/rebuild/rebuild-rederive-dataset.xml?raw'
import rebuildRederiveIntoExisting from './fixtures/rebuild/rebuild-rederive-into-existing.xml?raw'
import rebuildRederiveOntoHeld from './fixtures/rebuild/rebuild-rederive-onto-held.xml?raw'
import rebuildRederive from './fixtures/rebuild/rebuild-rederive.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { BuildIedRefusalCase } from './__tests__/build-ied-cases'
import type { RebuildTestCase } from './__tests__/rebuild-cases'
import type { IedBuildPlan } from './build-ied.types'
import type { SclTest } from '@/v2019C1/test'

const S = '//default:IED[@name="S"]'

/** Rebuilds that must keep what still holds, and move only into free identities. */
describe('buildIed - rebuilds that keep what still holds', () => {
	const testCases: SclTest.TestCases<RebuildTestCase> = {
		'PTOC1 respecified as PTRC 2 with PTRC_T3, which holds its values → renamed and retyped, no value removed':
			{
				sourceXml: rebuildReclassed,
				lnodes: ROLE_LNODES,
				report: {
					renamed: [
						{
							ln: 'ln-ptoc1',
							from: { prefix: '', lnClass: 'PTOC', inst: '1' },
							to: { prefix: '', lnClass: 'PTRC', inst: '2' },
						},
					],
					retyped: [{ ln: 'ln-ptoc1', from: 'PTOC_T', to: 'PTRC_T3', valuesRemoved: [] }],
				},
				expectedQueries: [
					`${S}//default:LN[@lnClass="PTRC"][@inst="2"]/default:DOI[@name="StrVal"]`,
					`${S}//default:LN[@lnClass="PTRC"][@inst="2"]/default:DOI[@name="Beh"]`,
				],
			},
		'rederiveLDevices with a DataSet in PROT’s LN0 → LNs moved to PRT, PROT kept with its LN0 and DataSet':
			{
				sourceXml: rebuildRederiveDataset,
				lnodes: ROLE_LNODES,
				rederiveLDevices: true,
				report: {
					added: { lDevices: ['PRT'], logicalNodes: ['lln0'] },
					moved: [
						{ ln: 'ln-ptoc1', fromLd: 'PROT', toLd: 'PRT' },
						{ ln: 'ln-ptrc1', fromLd: 'PROT', toLd: 'PRT' },
					],
				},
				expectedQueries: [
					`${S}//default:LDevice[@inst="PROT"]/default:LN0/default:DataSet[@name="DS1"]`,
				],
			},
		'rederiveLDevices into an LD PRT holding its LN0 and LPHD → LNs moved there, the LLN0 LNode bound to PRT’s LN0, PROT removed':
			{
				sourceXml: rebuildRederiveIntoExisting,
				lnodes: ROLE_LNODES,
				rederiveLDevices: true,
				report: {
					moved: [
						{ ln: 'ln-ptoc1', fromLd: 'PROT', toLd: 'PRT' },
						{ ln: 'ln-ptrc1', fromLd: 'PROT', toLd: 'PRT' },
					],
					removed: { logicalNodes: [], lDevices: ['ld-prot'] },
				},
				expectedQueries: [
					`//default:LNode[@lnClass="LLN0"][@lnUuid=${S}//default:LDevice[@inst="PRT"]/default:LN0/@uuid]`,
					`${S}//default:LDevice[@inst="PRT"]/default:LN[@lnClass="PTOC"]`,
				],
				unexpectedQueries: [
					`${S}//default:LDevice[@inst="PROT"]`,
					`${S}//default:LDevice[@inst="PRT"]/default:LN0[2]`,
				],
			},
		'rederiveLDevices without the LLN0 LNode, PROT’s LN0 bound by it → LNs moved to PRT, PROT kept, its LN0 listed outside':
			{
				sourceXml: rebuildRederive,
				lnodes: ['ptoc1', 'ptrc1', 'cswi1'],
				rederiveLDevices: true,
				report: {
					added: { lDevices: ['PRT'], logicalNodes: [] },
					moved: [
						{ ln: 'ln-ptoc1', fromLd: 'PROT', toLd: 'PRT' },
						{ ln: 'ln-ptrc1', fromLd: 'PROT', toLd: 'PRT' },
					],
					boundOutsideScope: [{ ln: 'ln-prot-lln0', lnode: 'lln0' }],
				},
				expectedQueries: [`${S}//default:LDevice[@inst="PROT"]/default:LN0`],
			},
	}

	runRebuildCases({ testCases })
})

/** A build given only new LNodes is a first build: an orphan of the logical device is no free identity. */
describe('buildIed - new LNodes alone, an orphan holding their identity', () => {
	const testCases: SclTest.TestCases<BuildIedRefusalCase> = {
		'PTRC1’s LNode re-created (unbound), built alone, the orphan PTRC1 in PROT → ln-collision, no duplicate':
			{
				sourceXml: rebuildRecreated,
				lnodes: ['ptrc1-new'],
				refusals: [{ reason: 'ln-collision', ref: 'ptrc1-new' }],
			},
	}

	runBuildIedRefusalCases({ testCases })
})

/** A move onto an identity the destination logical device keeps is refused. */
describe('buildIed - a move onto a kept identity', () => {
	type TestCase = SclTest.BaseXmlTestCase & { refusals: { reason: string; ref: string }[] }

	const testCases: SclTest.TestCases<TestCase> = {
		'rederiveLDevices into PRT, which keeps an unbound PTOC1 an ExtRef uses → ln-collision for PTOC1, nothing written':
			{
				sourceXml: rebuildRederiveOntoHeld,
				refusals: [{ reason: 'ln-collision', ref: 'ptoc1' }],
				expectedQueries: [`${S}//default:LDevice[@inst="PROT"]/default:LN[@lnClass="PTOC"]`],
			},
	}

	runSclTestCases.withExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const written = source.transaction((tx) =>
				buildIed(tx, {
					ied: { tagName: 'IED', id: 'ied-s' },
					lnodes: ROLE_LNODES.map((id) => ({ tagName: 'LNode' as const, id })),
					openValues: { lnType: sameClassInTargetIed },
					rederiveLDevices: true,
				}),
			)
			const refused = written.then(
				() => [],
				(error: unknown) =>
					(
						(toDialecteError(error)?.meta as { refusals?: IedBuildPlan['refusals'] } | undefined)
							?.refusals ?? []
					).map((refusal) => ({ reason: refusal.reason, ref: refusal.ref?.id ?? '' })),
			)
			await expect(refused).resolves.toEqual(testCase.refusals)
		},
	})
})
