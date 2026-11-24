import { runRebuildCases } from './__tests__/rebuild-cases'
import rebuildCtrlEmptied from './fixtures/rebuild/rebuild-ctrl-emptied.xml?raw'
import rebuildPtrc1DeletedUsed from './fixtures/rebuild/rebuild-ptrc1-deleted-used.xml?raw'
import rebuildPtrc1Deleted from './fixtures/rebuild/rebuild-ptrc1-deleted.xml?raw'
import rebuildUserLn from './fixtures/rebuild/rebuild-user-ln.xml?raw'

import { describe } from 'vitest'

import type { RebuildTestCase } from './__tests__/rebuild-cases'
import type { SclTest } from '@/v2019C1/test'

const PROT = '//default:IED[@name="S"]//default:LDevice[@inst="PROT"]'

/** Logical nodes no LNode specifies any more: removed from the logical devices the rebuild builds when unused. */
describe('buildIed - logical nodes the specification no longer holds', () => {
	const testCases: SclTest.TestCases<RebuildTestCase> = {
		'PTRC1’s LNode deleted, its logical node unused → removed': {
			sourceXml: rebuildPtrc1Deleted,
			lnodes: ['lln0', 'ptoc1', 'cswi1'],
			report: { removed: { logicalNodes: ['ln-ptrc1'], lDevices: [] } },
			unexpectedQueries: [`${PROT}/default:LN[@lnClass="PTRC"]`],
		},
		'PTRC1’s LNode deleted, an ExtRef of R naming its logical node → kept, listed with the ExtRef':
			{
				sourceXml: rebuildPtrc1DeletedUsed,
				lnodes: ['lln0', 'ptoc1', 'cswi1'],
				report: { keptInUse: [{ ln: 'ln-ptrc1', usedBy: ['extref-ptrc1'] }] },
				expectedQueries: [`${PROT}/default:LN[@lnClass="PTRC"]`],
			},
		'a logical node added by hand to LD PROT without LNode, unused → removed': {
			sourceXml: rebuildUserLn,
			lnodes: ['lln0', 'ptoc1', 'ptrc1', 'cswi1'],
			report: { removed: { logicalNodes: ['ln-ggio1'], lDevices: [] } },
			unexpectedQueries: [`${PROT}/default:LN[@lnClass="GGIO"]`],
		},
		'every LNode of CTRL deleted → LD CTRL listed with its orphan, nothing removed': {
			sourceXml: rebuildCtrlEmptied,
			lnodes: ['lln0', 'ptoc1', 'ptrc1'],
			report: { orphanLDevices: [{ lDevice: 'ld-ctrl', orphans: ['ln-cswi1'] }] },
			expectedQueries: [
				'//default:IED[@name="S"]//default:LDevice[@inst="CTRL"]/default:LN[@lnClass="CSWI"]',
			],
		},
	}

	runRebuildCases({ testCases })
})
