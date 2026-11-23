import { runBuildIedCases, runPlanParityCases } from './__tests__/build-ied-cases'
import baseBuiltOnS from './fixtures/build-ied/base-built-on-s.xml?raw'
import base from './fixtures/build-ied/base.xml?raw'
import builtOnSThenS2 from './fixtures/build-ied/built-on-s-then-s2.xml?raw'
import nonLeafSubFunction from './fixtures/build-ied/non-leaf-subfunction.xml?raw'

import { describe } from 'vitest'

import type { BuildIedInput, BuildIedTestCase } from './__tests__/build-ied-cases'
import type { SclTest } from '@/v2019C1/test'

/** The LDevice of that inst in the IED of that name. */
function ld(inst: string, ied = 'S'): string {
	return `//default:IED[@name="${ied}"]//default:LDevice[@inst="${inst}"]`
}

/** The LNode of that class, bound to the logical node of that class in that LD of S, its names stamped. */
function boundLNode(params: { lnClass: string; inst: string; ln?: 'LN' | 'LN0' }): string {
	const ln = `${ld(params.inst)}/default:${params.ln ?? 'LN'}[@lnClass="${params.lnClass}"]/@uuid`
	return `//default:LNode[@lnClass="${params.lnClass}"][@iedName="S"][@ldInst="${params.inst}"][@lnUuid=${ln}]`
}

/** Building a specification IED's logical devices and logical nodes from the LNodes of functions, and binding them. */
describe('buildIed - logical devices and logical nodes from function LNodes', () => {
	const testCases: SclTest.TestCases<BuildIedTestCase> = {
		'Q01 PROT: LLN0, PTOC1 in leaf I, PTRC1 in leaf TRIP → LD PROT with LN0, PTOC1, PTRC1, LPHD1 added, all bound':
			{
				sourceXml: base,
				lnodes: ['lln0', 'ptoc1', 'ptrc1'],
				created: { lDevices: 1, logicalNodes: 4 },
				// the LN0 comes from the LLN0 LNode; the added LPHD's type from the rule, the shell's
				openValuesUsed: [{ point: 'lnType', element: 'q01-prot', value: 'LPHD_T' }],
				expectedQueries: [
					`${ld('PROT')}/default:LN0[@lnClass="LLN0"][@inst=""][@lnType="LLN0_T"]`,
					`${ld('PROT')}/default:LN[@lnClass="PTOC"][@inst="1"][@lnType="PTOC_T"]`,
					`${ld('PROT')}/default:LN[@lnClass="PTRC"][@inst="1"][@lnType="PTRC_T"]`,
					`${ld('PROT')}/default:LN[@lnClass="LPHD"][@inst="1"][@lnType="LPHD_T"]`,
					boundLNode({ lnClass: 'LLN0', inst: 'PROT', ln: 'LN0' }),
					boundLNode({ lnClass: 'PTOC', inst: 'PROT' }),
					boundLNode({ lnClass: 'PTRC', inst: 'PROT' }),
					'//default:LNode[@lnClass="PTOC"]//v2019C1:LNodeSpecNaming[@sIedName="S"][@sLdInst="PROT"][@sLnClass="PTOC"][@sLnInst="1"]',
					`${ld('LD0')}/default:LN[@lnClass="LPHD"]`,
				],
				unexpectedQueries: [
					`${ld('PROT')}/default:LN0[2]`,
					`${ld('PROT')}/default:LN[@lnClass="LPHD"][2]`,
					ld('I'),
					ld('TRIP'),
					'//default:LNode[@lnClass="CSWI"][@lnUuid]',
				],
			},
		'XCBR1 with ldInst CB → LD CB with an added LN0 of the shell LN0 type, LPHD1, XCBR1': {
			sourceXml: base,
			lnodes: ['xcbr1'],
			created: { lDevices: 1, logicalNodes: 3 },
			openValuesUsed: [
				{ point: 'lnType', element: 'xcbr1', value: 'LLN0_T' },
				{ point: 'lnType', element: 'xcbr1', value: 'LPHD_T' },
			],
			expectedQueries: [
				`${ld('CB')}/default:LN0[@lnType="LLN0_T"]`,
				`${ld('CB')}/default:LN[@lnClass="XCBR"][@inst="1"]`,
				`${ld('CB')}/default:LN[@lnClass="LPHD"][@lnType="LPHD_T"]`,
				boundLNode({ lnClass: 'XCBR', inst: 'CB' }),
			],
			unexpectedQueries: [ld('CTRL')],
		},
		'MMXU2 in non-leaf MEAS, MMXU1 in its leaf A → one LD MEAS holding both': {
			sourceXml: nonLeafSubFunction,
			lnodes: ['mmxu1', 'mmxu2'],
			created: { lDevices: 1, logicalNodes: 4 },
			openValuesUsed: [
				{ point: 'lnType', element: 'meas', value: 'LLN0_T' },
				{ point: 'lnType', element: 'meas', value: 'LPHD_T' },
			],
			expectedQueries: [
				`${ld('MEAS')}/default:LN[@lnClass="MMXU"][@inst="1"]`,
				`${ld('MEAS')}/default:LN[@lnClass="MMXU"][@inst="2"]`,
				boundLNode({ lnClass: 'MMXU', inst: 'MEAS' }),
			],
			unexpectedQueries: [ld('A'), ld('PROT')],
		},
		'Q01 PROT already built on S and bound → building it again creates nothing': {
			sourceXml: baseBuiltOnS,
			lnodes: ['lln0', 'ptoc1', 'ptrc1'],
			created: { lDevices: 0, logicalNodes: 0 },
			expectedQueries: [`${ld('PROT')}/default:LN[@lnClass="PTOC"]`],
			unexpectedQueries: [
				`${ld('PROT')}[2]`,
				`${ld('PROT')}/default:LN[@lnClass="PTOC"][2]`,
				`${ld('PROT')}/default:LN[@lnClass="LPHD"][2]`,
			],
		},
		'PTOC1 of Q01 PROT built on S, PTRC1 built on S2 → LD PROT in S2 too': {
			sourceXml: builtOnSThenS2,
			ied: 'ied-s2',
			lnodes: ['ptrc1'],
			created: { lDevices: 1, logicalNodes: 3 },
			openValuesUsed: [
				{ point: 'lnType', element: 'q01-prot', value: 'LLN0_T' },
				{ point: 'lnType', element: 'q01-prot', value: 'LPHD_T' },
			],
			expectedQueries: [`${ld('PROT', 'S2')}/default:LN[@lnClass="PTRC"]`],
		},
	}

	runBuildIedCases({ testCases })
})

/** The plan `planIed` gives is the plan `buildIed` writes. */
describe('planIed - the plan the build writes', () => {
	const testCases: SclTest.TestCases<BuildIedInput> = {
		'Q01 PROT on S → the same plan from the query and from the build': {
			sourceXml: base,
			lnodes: ['lln0', 'ptoc1', 'ptrc1'],
		},
		'Q01 PROT already built on S → the same plan, every logical node existing': {
			sourceXml: baseBuiltOnS,
			lnodes: ['lln0', 'ptoc1', 'ptrc1'],
		},
	}

	runPlanParityCases({ testCases })
})
