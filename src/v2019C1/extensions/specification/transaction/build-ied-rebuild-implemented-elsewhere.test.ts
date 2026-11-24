import { sameClassInTargetIed } from '../build/open-value-rules'
import { buildIed } from './build-ied'
import rebuildImplementedElsewhere from './fixtures/rebuild/rebuild-implemented-elsewhere.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

/** An LNode a real IED implements now leaves its logical node in the S-IED an orphan, removed when unused, and says why. */
describe('buildIed - an orphan whose LNode a real IED implements now', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'PTRC1 now bound to R’s PTRC1, its naming still naming S’s → S’s PTRC1 removed, tagged implemented by R':
			{
				sourceXml: rebuildImplementedElsewhere,
				unexpectedQueries: ['//default:IED[@name="S"]//default:LN[@lnClass="PTRC"]'],
				expectedQueries: ['//default:IED[@name="R"]//default:LN[@lnClass="PTRC"]'],
			},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source }) => {
			const built = source.transaction((tx) =>
				buildIed(tx, {
					ied: { tagName: 'IED', id: 'ied-s' },
					lnodes: ['lln0', 'ptoc1', 'ptrc1', 'cswi1'].map((id) => ({
						tagName: 'LNode' as const,
						id,
					})),
					openValues: { lnType: sameClassInTargetIed },
				}),
			)
			await expect(
				built.then(({ plan }) => ({
					removed: plan.rebuild.removed.logicalNodes.map((ln) => ln.id),
					implementedElsewhere: plan.rebuild.implementedElsewhere.map((entry) => ({
						ln: entry.ln.id,
						lnode: entry.lnode.id,
						ied: entry.ied.id,
						iedName: entry.iedName,
					})),
				})),
			).resolves.toEqual({
				removed: ['ln-ptrc1'],
				implementedElsewhere: [{ ln: 'ln-ptrc1', lnode: 'ptrc1', ied: 'ied-r', iedName: 'R' }],
			})
		},
	})
})
