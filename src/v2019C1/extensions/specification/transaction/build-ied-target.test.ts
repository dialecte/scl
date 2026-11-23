import { runBuildIedCases, runBuildIedRefusalCases } from './__tests__/build-ied-cases'
import functionTemplateLNode from './fixtures/build-ied/function-template-lnode.xml?raw'
import noServer from './fixtures/build-ied/no-server.xml?raw'
import ptoc1ImplementedByRealR from './fixtures/build-ied/ptoc1-implemented-by-real-r.xml?raw'
import realIedTarget from './fixtures/build-ied/real-ied-target.xml?raw'
import twoServers from './fixtures/build-ied/two-servers.xml?raw'

import { describe } from 'vitest'

import type { BuildIedRefusalCase, BuildIedTestCase } from './__tests__/build-ied-cases'
import type { SclTest } from '@/v2019C1/test'

/** The target, its server, and the LNodes another IED implements. */
describe('buildIed - target, server, LNodes implemented elsewhere', () => {
	const testCases: SclTest.TestCases<BuildIedTestCase> = {
		'S with servers in AP1 and AP2, server AP2 given → LD PROT under AP2': {
			sourceXml: twoServers,
			lnodes: ['lln0', 'ptoc1', 'ptrc1'],
			server: 'server-ap2',
			created: { lDevices: 1, logicalNodes: 4 },
			openValuesUsed: [{ point: 'lnType', element: 'q01-prot', value: 'LPHD_T' }],
			expectedQueries: [
				'//default:AccessPoint[@name="AP2"]/default:Server/default:LDevice[@inst="PROT"]/default:LN[@lnClass="PTOC"]',
			],
			unexpectedQueries: ['//default:AccessPoint[@name="AP1"]//default:LDevice[@inst="PROT"]'],
		},
		'PTOC1 bound to real IED R among Q01 PROT → PTOC1 left out and listed, the rest built': {
			sourceXml: ptoc1ImplementedByRealR,
			lnodes: ['lln0', 'ptoc1', 'ptrc1'],
			created: { lDevices: 1, logicalNodes: 3 },
			openValuesUsed: [{ point: 'lnType', element: 'q01-prot', value: 'LPHD_T' }],
			leftOut: [{ lnode: 'ptoc1', ied: 'ied-r' }],
			expectedQueries: [
				'//default:IED[@name="S"]//default:LDevice[@inst="PROT"]/default:LN[@lnClass="PTRC"]',
				'//default:LNode[@lnClass="PTOC"][@iedName="R"]',
			],
			unexpectedQueries: [
				'//default:IED[@name="S"]//default:LDevice[@inst="PROT"]/default:LN[@lnClass="PTOC"]',
			],
		},
	}

	runBuildIedCases({ testCases })
})

/** Targets and LNodes the build refuses. */
describe('buildIed - target and LNodes refused', () => {
	const testCases: SclTest.TestCases<BuildIedRefusalCase> = {
		'target R holds an ICD source file → not-specification-ied': {
			sourceXml: realIedTarget,
			ied: 'ied-r',
			lnodes: ['ptoc1'],
			refusals: [{ reason: 'not-specification-ied', ref: 'ied-r' }],
		},
		'S with servers in AP1 and AP2, no server given → server': {
			sourceXml: twoServers,
			lnodes: ['ptoc1'],
			refusals: [{ reason: 'server', ref: 'ied-s' }],
		},
		'S with a server-less access point → server': {
			sourceXml: noServer,
			lnodes: ['ptoc1'],
			refusals: [{ reason: 'server', ref: 'ied-s' }],
		},
		'an LNode of a function template → lnode-outside-process': {
			sourceXml: functionTemplateLNode,
			lnodes: ['tpl-ptoc1'],
			refusals: [{ reason: 'lnode-outside-process', ref: 'tpl-ptoc1' }],
		},
	}

	runBuildIedRefusalCases({ testCases })
})
