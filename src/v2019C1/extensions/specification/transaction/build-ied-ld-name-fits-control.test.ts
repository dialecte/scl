import { sameClassInTargetIed } from '../build/open-value-rules'
import { buildIed } from './build-ied'
import ldNameAlsoFits from './fixtures/build-values/ld-name-also-fits.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

/** Without `ldNameAlsoFits`, the IED's own name decides: the 55-character function's logical device is built. */
describe('buildIed - a logical device name fitting the IED name alone', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'IED S, function of 55 characters, no ldNameAlsoFits → its logical device built, 1 + 55 within 64':
			{
				sourceXml: ldNameAlsoFits,
				expectedQueries: [
					`//default:IED[@name="S"]//default:LDevice[@inst="${'P'.repeat(55)}"]/default:LN[@lnClass="PTOC"]`,
				],
			},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source }) => {
			const built = source.transaction((tx) =>
				buildIed(tx, {
					ied: { tagName: 'IED', id: 'ied-s' },
					lnodes: [{ tagName: 'LNode', id: 'ptoc1' }],
					openValues: { lnType: sameClassInTargetIed },
				}),
			)
			await expect(built.then((result) => result.created.lDevices.length)).resolves.toBe(1)
		},
	})
})
