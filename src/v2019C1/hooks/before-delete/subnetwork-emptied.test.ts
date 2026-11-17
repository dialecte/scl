import twoIedsOnTheirOwnSubnetworks from './fixtures/two-ieds-on-their-own-subnetworks.xml?raw'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

describe('a subnetwork a delete leaves without a connected access point', () => {
	type TestCase = SclTest.BaseXmlTestCase & { deleted: Scl.Ref<Scl.ElementsOf> }

	const testCases: SclTest.TestCases<TestCase> = {
		// two-ieds-on-their-own-subnetworks.xml: IED7 is N1's only connection, IED8 is on N2
		'the only IED connected to a subnetwork deleted → the subnetwork goes, the other one stays': {
			sourceXml: twoIedsOnTheirOwnSubnetworks,
			deleted: { tagName: 'IED', id: 'ied7' },
			expectedQueries: [
				'//default:Communication/default:SubNetwork[@name="N2"]/default:ConnectedAP[@iedName="IED8"]',
			],
			unexpectedQueries: [
				'//default:SubNetwork[@name="N1"]',
				'//default:ConnectedAP[@iedName="IED7"]',
			],
		},
		// the same IED7, its access point AP1 deleted, its AP2 kept
		'the only access point connected to a subnetwork deleted → the subnetwork goes, its IED keeps its other one':
			{
				sourceXml: twoIedsOnTheirOwnSubnetworks,
				deleted: { tagName: 'AccessPoint', id: 'ap7' },
				expectedQueries: ['//default:SubNetwork[@name="N2"]'],
				unexpectedQueries: ['//default:SubNetwork[@name="N1"]'],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function deleteIt(tx) {
			await tx.delete(testCase.deleted)
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
