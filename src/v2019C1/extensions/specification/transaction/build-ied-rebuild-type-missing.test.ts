import { sameClassInTargetIed } from '../build/open-value-rules'
import { ROLE_LNODES } from './__tests__/rebuild-cases'
import { buildIed } from './build-ied'
import rebuildTypeMissing from './fixtures/rebuild/rebuild-type-missing.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

/** Contract: an LNode bound to S whose type the document lacks is refused, as a new one is, nothing written. */
describe('buildIed - a bound LNode naming no LNodeType', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'PTOC1, bound to S’s PTOC1, names PTOC_X, a type the document lacks → type-missing naming PTOC1, nothing written':
			{
				// rebuild-type-missing: as rebuild-built.xml, PTOC1’s lnType PTOC_X names no LNodeType
				sourceXml: rebuildTypeMissing,
				expectedQueries: [
					'//default:IED[@name="S"]//default:LN[@lnClass="PTOC"][@lnType="PTOC_T"]',
				],
			},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source }) => {
			const refused = await source
				.transaction((tx) =>
					buildIed(tx, {
						ied: { tagName: 'IED', id: 'ied-s' },
						lnodes: ROLE_LNODES.map((lnode) => ({ tagName: 'LNode' as const, id: lnode })),
						openValues: { lnType: sameClassInTargetIed },
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
				refusals: expect.arrayContaining([
					expect.objectContaining({
						reason: 'type-missing',
						ref: { tagName: 'LNode', id: 'ptoc1' },
					}),
				]),
			})
		},
	})
})
