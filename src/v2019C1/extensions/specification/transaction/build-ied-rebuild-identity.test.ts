import { runBuildIedRefusalCases } from './__tests__/build-ied-cases'
import { ROLE_LNODES, runRebuildCases } from './__tests__/rebuild-cases'
import rebuildClassMismatch from './fixtures/rebuild/rebuild-class-mismatch.xml?raw'
import rebuildPtoc1Renamed from './fixtures/rebuild/rebuild-ptoc1-renamed.xml?raw'
import rebuildRenameOntoKept from './fixtures/rebuild/rebuild-rename-onto-kept.xml?raw'
import rebuildRenameOntoRemoved from './fixtures/rebuild/rebuild-rename-onto-removed.xml?raw'
import rebuildRenameThenAdd from './fixtures/rebuild/rebuild-rename-then-add.xml?raw'
import rebuildRetyped from './fixtures/rebuild/rebuild-retyped.xml?raw'

import { describe } from 'vitest'

import type { BuildIedRefusalCase } from './__tests__/build-ied-cases'
import type { RebuildTestCase } from './__tests__/rebuild-cases'
import type { SclTest } from '@/v2019C1/test'

const PROT = '//default:IED[@name="S"]//default:LDevice[@inst="PROT"]'
const PTOC_1 = { prefix: '', lnClass: 'PTOC', inst: '1' }
const PTOC_2 = { prefix: '', lnClass: 'PTOC', inst: '2' }

/** A built logical node follows its specification naming and its LNode's type, in place. */
describe('buildIed - rebuilt logical nodes renamed and retyped', () => {
	const testCases: SclTest.TestCases<RebuildTestCase> = {
		'sLnInst of PTOC1 1 → 2 → renamed in place, the ExtRef naming it follows': {
			sourceXml: rebuildPtoc1Renamed,
			lnodes: ROLE_LNODES,
			report: { renamed: [{ ln: 'ln-ptoc1', from: PTOC_1, to: PTOC_2 }] },
			expectedQueries: [
				`${PROT}/default:LN[@lnClass="PTOC"][@inst="2"][@uuid="c3000000-0000-4000-8000-000000000002"]`,
				'//default:ExtRef[@lnClass="PTOC"][@lnInst="2"]',
			],
			unexpectedQueries: [`${PROT}/default:LN[@lnClass="PTOC"][@inst="1"]`],
		},
		'PTOC1 typed PTOC_T2, which has no StrVal → retyped, its StrVal value removed and listed': {
			sourceXml: rebuildRetyped,
			lnodes: ROLE_LNODES,
			report: {
				retyped: [
					{ ln: 'ln-ptoc1', from: 'PTOC_T', to: 'PTOC_T2', valuesRemoved: ['dai-strval-f'] },
				],
			},
			expectedQueries: [
				`${PROT}/default:LN[@lnClass="PTOC"][@lnType="PTOC_T2"]/default:DOI[@name="Beh"]`,
			],
			unexpectedQueries: [`${PROT}/default:LN[@lnClass="PTOC"]/default:DOI[@name="StrVal"]`],
		},
		'PTOC2’s LNode deleted, PTOC1 renamed onto PTOC2 → the orphan removed first, then the rename': {
			sourceXml: rebuildRenameOntoRemoved,
			lnodes: ROLE_LNODES,
			report: {
				renamed: [{ ln: 'ln-ptoc1', from: PTOC_1, to: PTOC_2 }],
				removed: { logicalNodes: ['ln-ptoc2'], lDevices: [] },
			},
			expectedQueries: [`${PROT}/default:LN[@lnClass="PTOC"][@inst="2"]`],
			unexpectedQueries: [`${PROT}/default:LN[@lnClass="PTOC"][@inst="2"][2]`],
		},
		'PTOC1 renamed to PTOC2 and a new PTOC1 added → the rename first, then the add, no duplicate': {
			sourceXml: rebuildRenameThenAdd,
			lnodes: [...ROLE_LNODES, 'ptoc-new'],
			report: {
				added: { lDevices: [], logicalNodes: ['ptoc-new'] },
				renamed: [{ ln: 'ln-ptoc1', from: PTOC_1, to: PTOC_2 }],
			},
			expectedQueries: [
				`${PROT}/default:LN[@lnClass="PTOC"][@inst="1"]`,
				`${PROT}/default:LN[@lnClass="PTOC"][@inst="2"]`,
			],
			unexpectedQueries: [`${PROT}/default:LN[@lnClass="PTOC"][@inst="1"][2]`],
		},
	}

	runRebuildCases({ testCases })
})

/** Renames the rebuild refuses. */
describe('buildIed - rebuilt logical nodes refused', () => {
	const testCases: SclTest.TestCases<BuildIedRefusalCase> = {
		'sLnClass of PTOC1 set to PTRC, its type PTOC_T → type-mismatch': {
			sourceXml: rebuildClassMismatch,
			lnodes: ROLE_LNODES,
			refusals: [{ reason: 'type-mismatch', ref: 'ptoc1' }],
		},
		'PTOC1 renamed onto PTOC2, still bound by its LNode → ln-collision': {
			sourceXml: rebuildRenameOntoKept,
			lnodes: [...ROLE_LNODES, 'ptoc2'],
			refusals: [{ reason: 'ln-collision', ref: 'ptoc1' }],
		},
	}

	runBuildIedRefusalCases({ testCases })
})
