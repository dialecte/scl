import { executeTableDrivenTestsChainOperations } from '@dialecte/core'
import { describe, it, expect } from 'vitest'

import {
	createSclTestDialecte,
	XMLNS_SCL_NAMESPACE,
	XMLNS_DEV_NAMESPACE,
	DEV_ID,
} from '@/v2019C1/helpers'

import type { Scl } from '@/v2019C1/config'
import type { ChainTestOperation } from '@dialecte/core'

const xmlString = /* xml */ `
<SCL ${XMLNS_SCL_NAMESPACE} ${XMLNS_DEV_NAMESPACE} >
	<Header id="headerId">
		<History ${DEV_ID}="historyId" />
	</Header>
</SCL>`

describe('getLatestHitem', () => {
	describe('retrieving latest history item', () => {
		type TestCase = {
			description: string
			operations: Array<
				ChainTestOperation<Scl.Config, Scl.ElementsOf, Scl.ChildrenOf<Scl.ElementsOf>>
			>
			expected: { version: string; revision: string; who: string } | undefined
		}

		const testCases: TestCase[] = [
			{
				description: 'returns undefined when history is empty',
				operations: [],
				expected: undefined,
			},
			{
				description: 'returns single Hitem when only one exists',
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
				expected: { version: '1', revision: '1', who: 'User1' },
			},
			{
				description: 'returns Hitem with highest revision when versions are same',
				operations: [
					{
						type: 'addChild',
						goTo: { tagName: 'History', id: 'historyId' },
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
						goTo: { tagName: 'History', id: 'historyId' },
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 11:00:00 CET 2026',
							who: 'User3',
							what: 'Third',
							version: '1',
							revision: '3',
						},
					},
					{
						type: 'addChild',
						goTo: { tagName: 'History', id: 'historyId' },
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:30:00 CET 2026',
							who: 'User2',
							what: 'Second',
							version: '1',
							revision: '2',
						},
					},
				],
				expected: { version: '1', revision: '3', who: 'User3' },
			},
			{
				description: 'returns Hitem with highest version',
				operations: [
					{
						type: 'addChild',
						goTo: { tagName: 'History', id: 'historyId' },
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'User1',
							what: 'Version 1',
							version: '1',
							revision: '1',
						},
					},
					{
						type: 'addChild',
						goTo: { tagName: 'History', id: 'historyId' },
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 11:00:00 CET 2026',
							who: 'User0',
							what: 'Version 0',
							version: '0',
							revision: '1',
						},
					},
					{
						type: 'addChild',
						goTo: { tagName: 'History', id: 'historyId' },
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 12:00:00 CET 2026',
							who: 'User2',
							what: 'Version 2',
							version: '2',
							revision: '1',
						},
					},
				],
				expected: { version: '2', revision: '1', who: 'User2' },
			},
			{
				description: 'returns Hitem with highest version and revision combination',
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
						goTo: { tagName: 'History', id: 'historyId' },
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 11:00:00 CET 2026',
							who: 'User2-1',
							what: 'V2R1',
							version: '2',
							revision: '1',
						},
					},
					{
						type: 'addChild',
						goTo: { tagName: 'History', id: 'historyId' },
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 12:00:00 CET 2026',
							who: 'User0-3',
							what: 'V0R3',
							version: '0',
							revision: '3',
						},
					},
					{
						type: 'addChild',
						goTo: { tagName: 'History', id: 'historyId' },
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 13:00:00 CET 2026',
							who: 'User1-1',
							what: 'V1R1',
							version: '1',
							revision: '1',
						},
					},
				],
				expected: { version: '2', revision: '1', who: 'User2-1' },
			},
			{
				description: 'treats missing version as 0 - returns item with explicit version',
				operations: [
					{
						type: 'addChild',
						goTo: { tagName: 'History', id: 'historyId' },
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'User0',
							what: 'No version',
							revision: '1',
						},
					},
					{
						type: 'addChild',
						goTo: { tagName: 'History', id: 'historyId' },
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 11:00:00 CET 2026',
							who: 'User1',
							what: 'With version',
							version: '1',
							revision: '1',
						},
					},
				],
				expected: { version: '1', revision: '1', who: 'User1' },
			},
			{
				description: 'treats missing revision as 0 - returns item with explicit revision',
				operations: [
					{
						type: 'addChild',
						goTo: { tagName: 'History', id: 'historyId' },
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'User0',
							what: 'No revision',
							version: '1',
						},
					},
					{
						type: 'addChild',
						goTo: { tagName: 'History', id: 'historyId' },
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 11:00:00 CET 2026',
							who: 'User1',
							what: 'With revision',
							version: '1',
							revision: '1',
						},
					},
				],
				expected: { version: '1', revision: '1', who: 'User1' },
			},
		]

		testCases.forEach(testGetLatestHitem)

		function testGetLatestHitem(testCase: TestCase) {
			it(testCase.description, async () => {
				const { expected } = testCase
				// Arrange
				const { dialecte, cleanup } = await createSclTestDialecte({ xmlString })

				await executeTableDrivenTestsChainOperations({
					chain: dialecte.fromRoot(),
					operations: testCase.operations,
				})

				// Act
				const historyChain = dialecte.fromElement({ tagName: 'History', id: 'historyId' })
				const latestHitem = await historyChain.getLatestHitem()

				// Assert
				if (expected === undefined) {
					expect(latestHitem).toBeUndefined()
				} else {
					expect(latestHitem).toBeDefined()
					if (latestHitem) {
						const result = await dialecte
							.fromElement({ tagName: 'Hitem', id: latestHitem.id })
							.getAttributesValues()
						expect(result.version).toBe(expected.version)
						expect(result.revision).toBe(expected.revision)
						expect(result.who).toBe(expected.who)
					}
				}

				// Cleanup
				await cleanup()
			})
		}
	})
})
