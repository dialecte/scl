import { sameClassInTargetIed } from '../build/open-value-rules'
import { buildIed } from './build-ied'
import rebuildBuilt from './fixtures/rebuild/rebuild-built.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

/** An LNode whose own names were edited while bound (import repairs them from the binding, an edit does not). */
describe('buildIed - drift between a bound LNode and its logical node', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'PTOC1’s lnInst edited to 5 in the transaction, then rebuilt → drift listed, the logical node untouched':
			{
				sourceXml: rebuildBuilt,
				allowInvalidOutput: {
					reason:
						'the case is the drift: the edited lnInst no longer names the logical node its lnUuid binds, and a rebuild only lists it',
					violations: [{ check: 'references', code: 'path' }],
				},
				expectedQueries: ['//default:LDevice[@inst="PROT"]/default:LN[@lnClass="PTOC"][@inst="1"]'],
				unexpectedQueries: [
					'//default:LDevice[@inst="PROT"]/default:LN[@lnClass="PTOC"][@inst="5"]',
				],
			},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source }) => {
			const built = source.transaction(async function editThenRebuild(tx) {
				await tx.update({ tagName: 'LNode', id: 'ptoc1' }, { attributes: { lnInst: '5' } })
				return buildIed(tx, {
					ied: { tagName: 'IED', id: 'ied-s' },
					lnodes: ['lln0', 'ptoc1', 'ptrc1', 'cswi1'].map((id) => ({
						tagName: 'LNode' as const,
						id,
					})),
					openValues: { lnType: sameClassInTargetIed },
				})
			})
			await expect(
				built.then((result) =>
					result.plan.rebuild.drift.map((entry) => ({ lnode: entry.lnode.id, ln: entry.ln.id })),
				),
			).resolves.toEqual([{ lnode: 'ptoc1', ln: 'ln-ptoc1' }])
		},
	})
})
