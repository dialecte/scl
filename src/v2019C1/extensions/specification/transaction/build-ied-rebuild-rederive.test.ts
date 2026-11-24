import { ROLE_LNODES, runRebuildCases } from './__tests__/rebuild-cases'
import rebuildRederive from './fixtures/rebuild/rebuild-rederive.xml?raw'
import rebuildRederivedBefore from './fixtures/rebuild/rebuild-rederived-before.xml?raw'

import { describe } from 'vitest'

import type { RebuildTestCase } from './__tests__/rebuild-cases'
import type { SclTest } from '@/v2019C1/test'

const S = '//default:IED[@name="S"]'

/** `rederiveLDevices`: built logical nodes follow their function to the logical device it now gives. */
describe('buildIed - logical devices re-derived from their functions', () => {
	const testCases: SclTest.TestCases<RebuildTestCase> = {
		'Function PROT renamed PRT, rederiveLDevices → LD PRT, PTOC1 and PTRC1 moved, the LLN0 LNode bound to PRT’s LN0, PROT emptied and removed':
			{
				sourceXml: rebuildRederive,
				lnodes: ROLE_LNODES,
				rederiveLDevices: true,
				report: {
					added: { lDevices: ['PRT'], logicalNodes: ['lln0'] },
					moved: [
						{ ln: 'ln-ptoc1', fromLd: 'PROT', toLd: 'PRT' },
						{ ln: 'ln-ptrc1', fromLd: 'PROT', toLd: 'PRT' },
					],
					removed: { logicalNodes: [], lDevices: ['ld-prot'] },
				},
				expectedQueries: [
					`${S}//default:LDevice[@inst="PRT"]/default:LN[@lnClass="PTOC"][@uuid="c3000000-0000-4000-8000-000000000002"]`,
					`${S}//default:LDevice[@inst="PRT"]/default:LN[@lnClass="PTRC"]`,
					'//default:ExtRef[@lnClass="PTOC"][@ldInst="PRT"]',
					'//default:LNode[@lnClass="PTOC"]//v2019C1:LNodeSpecNaming[@sLdInst="PRT"]',
					`//default:LNode[@lnClass="LLN0"][@lnUuid=${S}//default:LDevice[@inst="PRT"]/default:LN0/@uuid]`,
				],
				unexpectedQueries: [`${S}//default:LDevice[@inst="PROT"]`],
			},
		're-derived before (LD PRT, sLdInst PRT), a default rebuild → nothing reported': {
			sourceXml: rebuildRederivedBefore,
			lnodes: ROLE_LNODES,
			report: {},
		},
	}

	runRebuildCases({ testCases })
})
