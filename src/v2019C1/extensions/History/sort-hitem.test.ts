import { executeChainOperations } from '@dialecte/core'
import { describe, it, expect } from 'vitest'

import {
	createSclTestDialecte,
	XMLNS_SCL_NAMESPACE,
	XMLNS_DEV_NAMESPACE,
	DEV_ID,
} from '@/v2019C1/helpers'

import type { Scl } from '@/v2019C1/config'
import type { Chain, ChainTestOperation } from '@dialecte/core'

const xmlString = /* xml */ `
<SCL ${XMLNS_SCL_NAMESPACE} ${XMLNS_DEV_NAMESPACE} >
	<Header>
		<History ${DEV_ID}="historyId" />
	</Header>
</SCL>`

describe('getSortedHitems', () => {
	describe('sorting by version then revision', () => {
		type TestCase = {
			description: string
			operations: Array<
				ChainTestOperation<Scl.Config, Scl.ElementsOf, Scl.ChildrenOf<Scl.ElementsOf>>
			>
			expected: Array<{ version: string; revision: string; who: string }>
		}

		const testCases: TestCase[] = [
			{
				description: 'empty history returns empty array',
				operations: [],
				expected: [],
			},
			{
				description: 'single Hitem returns that item',
				operations: [
					{
						type: 'addChild',
						goTo: { tagName: 'History', id: 'historyId' },
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'User1',
							what: 'Created',
							version: '1',
							revision: '1',
						},
					},
				],
				expected: [{ version: '1', revision: '1', who: 'User1' }],
			},
			{
				description: 'sorts by revision when versions are same',
				operations: [
					{
						type: 'addChild',
						goTo: { tagName: 'History', id: 'historyId' },
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'User3',
							what: 'Third',
							version: '1',
							revision: '3',
						},
					},
					{
						type: 'addChild',
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'User1',
							what: 'First',
							version: '1',
							revision: '1',
						},
					},
					{
						type: 'addChild',
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'User2',
							what: 'Second',
							version: '1',
							revision: '2',
						},
					},
				],
				expected: [
					{ version: '1', revision: '1', who: 'User1' },
					{ version: '1', revision: '2', who: 'User2' },
					{ version: '1', revision: '3', who: 'User3' },
				],
			},
			{
				description: 'sorts by version first',
				operations: [
					{
						type: 'addChild',
						goTo: { tagName: 'History', id: 'historyId' },
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'User2',
							what: 'Version 2',
							version: '2',
							revision: '1',
						},
					},
					{
						type: 'addChild',
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'User0',
							what: 'Version 0',
							version: '0',
							revision: '1',
						},
					},
					{
						type: 'addChild',
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'User1',
							what: 'Version 1',
							version: '1',
							revision: '1',
						},
					},
				],
				expected: [
					{ version: '0', revision: '1', who: 'User0' },
					{ version: '1', revision: '1', who: 'User1' },
					{ version: '2', revision: '1', who: 'User2' },
				],
			},
			{
				description: 'sorts by version then revision with mixed data',
				operations: [
					{
						type: 'addChild',
						goTo: { tagName: 'History', id: 'historyId' },
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'User1-2',
							what: 'V1R2',
							version: '1',
							revision: '2',
						},
					},
					{
						type: 'addChild',
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'User2-1',
							what: 'V2R1',
							version: '2',
							revision: '1',
						},
					},
					{
						type: 'addChild',
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'User0-3',
							what: 'V0R3',
							version: '0',
							revision: '3',
						},
					},
					{
						type: 'addChild',
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'User1-1',
							what: 'V1R1',
							version: '1',
							revision: '1',
						},
					},
					{
						type: 'addChild',
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'User0-1',
							what: 'V0R1',
							version: '0',
							revision: '1',
						},
					},
				],
				expected: [
					{ version: '0', revision: '1', who: 'User0-1' },
					{ version: '0', revision: '3', who: 'User0-3' },
					{ version: '1', revision: '1', who: 'User1-1' },
					{ version: '1', revision: '2', who: 'User1-2' },
					{ version: '2', revision: '1', who: 'User2-1' },
				],
			},
			{
				description: 'treats missing version as 0',
				operations: [
					{
						type: 'addChild',
						goTo: { tagName: 'History', id: 'historyId' },
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'User1',
							what: 'With version',
							version: '1',
							revision: '1',
						},
					},
					{
						type: 'addChild',
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'User0',
							what: 'No version',
							revision: '1',
						},
					},
				],
				expected: [
					{ version: '', revision: '1', who: 'User0' },
					{ version: '1', revision: '1', who: 'User1' },
				],
			},
			{
				description: 'treats missing revision as 0',
				operations: [
					{
						type: 'addChild',
						goTo: { tagName: 'History', id: 'historyId' },
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'User1',
							what: 'With revision',
							version: '1',
							revision: '1',
						},
					},
					{
						type: 'addChild',
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'User0',
							what: 'No revision',
							version: '1',
						},
					},
				],
				expected: [
					{ version: '1', revision: '', who: 'User0' },
					{ version: '1', revision: '1', who: 'User1' },
				],
			},
		]

		testCases.forEach(testSortedHitems)

		function testSortedHitems(testCase: TestCase) {
			it(testCase.description, async () => {
				const { expected } = testCase

				// Arrange
				const { dialecte, cleanup } = await createSclTestDialecte({ xmlString })

				await executeChainOperations({
					chain: dialecte.fromRoot() as Chain<Scl.Config, Scl.ElementsOf>,
					operations: testCase.operations,
				})

				// Act
				const historyChain = dialecte.fromElement({ tagName: 'History', id: 'historyId' })
				const sortedHitems = await historyChain.getSortedHitems()

				// Assert
				expect(sortedHitems.length).toBe(expected.length)

				for (let index = 0; index < sortedHitems.length; index++) {
					const hitem = sortedHitems[index]
					const result = await dialecte
						.fromElement({ tagName: 'Hitem', id: hitem.id })
						.getAttributesValues()
					expect(result.version).toBe(expected[index].version)
					expect(result.revision).toBe(expected[index].revision)
					expect(result.who).toBe(expected[index].who)
				}

				// Cleanup
				await cleanup()
			})
		}
	})
})
