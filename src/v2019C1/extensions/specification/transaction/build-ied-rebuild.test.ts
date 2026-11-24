import { runPlanParityCases } from './__tests__/build-ied-cases'
import { ROLE_LNODES, runRebuildCases } from './__tests__/rebuild-cases'
import rebuildBuilt from './fixtures/rebuild/rebuild-built.xml?raw'
import rebuildMovedByHand from './fixtures/rebuild/rebuild-moved-by-hand.xml?raw'
import rebuildProtRenamedPtoc2Added from './fixtures/rebuild/rebuild-prot-renamed-ptoc2-added.xml?raw'
import rebuildProtRenamed from './fixtures/rebuild/rebuild-prot-renamed.xml?raw'
import rebuildPtoc2Added from './fixtures/rebuild/rebuild-ptoc2-added.xml?raw'
import rebuildTypeless from './fixtures/rebuild/rebuild-typeless.xml?raw'

import { describe } from 'vitest'

import type { BuildIedInput } from './__tests__/build-ied-cases'
import type { RebuildTestCase } from './__tests__/rebuild-cases'
import type { SclTest } from '@/v2019C1/test'

/** The LDevice of that inst in S. */
function ld(inst: string): string {
	return `//default:IED[@name="S"]//default:LDevice[@inst="${inst}"]`
}

/** A rebuild pairs each LNode with the logical node it is bound to, and reports only what changes. */
describe('buildIed - rebuilding an IED built before', () => {
	const testCases: SclTest.TestCases<RebuildTestCase> = {
		'nothing changed since the build → nothing reported, nothing written': {
			sourceXml: rebuildBuilt,
			lnodes: ROLE_LNODES,
			report: {},
			unexpectedQueries: [`${ld('PROT')}/default:LN[@lnClass="PTOC"][2]`, `${ld('PROT')}[2]`],
		},
		'LNode PTOC2 added to the built PROT → added in LD PROT': {
			sourceXml: rebuildPtoc2Added,
			lnodes: [...ROLE_LNODES, 'ptoc2'],
			report: { added: { lDevices: [], logicalNodes: ['ptoc2'] } },
			expectedQueries: [`${ld('PROT')}/default:LN[@lnClass="PTOC"][@inst="2"]`],
		},
		'Function PROT renamed PRT → its logical device kept, nothing reported': {
			sourceXml: rebuildProtRenamed,
			lnodes: ROLE_LNODES,
			report: {},
			unexpectedQueries: [ld('PRT')],
		},
		'Function PROT renamed PRT and PTOC2 added → PTOC2 joins LD PROT, no LD PRT': {
			sourceXml: rebuildProtRenamedPtoc2Added,
			lnodes: [...ROLE_LNODES, 'ptoc2'],
			report: { added: { lDevices: [], logicalNodes: ['ptoc2'] } },
			expectedQueries: [`${ld('PROT')}/default:LN[@lnClass="PTOC"][@inst="2"]`],
			unexpectedQueries: [ld('PRT')],
		},
		'rebuilt from PROT alone → CTRL’s logical nodes bound outside the set, untouched': {
			sourceXml: rebuildBuilt,
			lnodes: ['lln0', 'ptoc1', 'ptrc1'],
			report: { boundOutsideScope: [{ ln: 'ln-cswi1', lnode: 'cswi1' }] },
			expectedQueries: [`${ld('CTRL')}/default:LN[@lnClass="CSWI"]`],
		},
		'PTOC1 without lnType, built before → its type kept, nothing reported': {
			sourceXml: rebuildTypeless,
			lnodes: ROLE_LNODES,
			report: {},
			expectedQueries: [`${ld('PROT')}/default:LN[@lnClass="PTOC"][@lnType="PTOC_T"]`],
		},
		'PTOC1’s logical node moved by hand to LD CTRL → kept there, nothing reported': {
			sourceXml: rebuildMovedByHand,
			lnodes: ROLE_LNODES,
			report: {},
			expectedQueries: [`${ld('CTRL')}/default:LN[@lnClass="PTOC"]`],
			unexpectedQueries: [`${ld('PROT')}/default:LN[@lnClass="PTOC"]`],
		},
	}

	runRebuildCases({ testCases })
})

/** The rebuild `planIed` reports is the one `buildIed` applies. */
describe('planIed - the rebuild the build applies', () => {
	const testCases: SclTest.TestCases<BuildIedInput> = {
		'PTOC2 added to the built PROT → the same plan from the query and from the build': {
			sourceXml: rebuildPtoc2Added,
			lnodes: [...ROLE_LNODES, 'ptoc2'],
		},
	}

	runPlanParityCases({ testCases })
})
