import { assert, executeTableDrivenTestsChainOperations } from '@dialecte/core'
import { describe, it, expect } from 'vitest'

import { createSclTestDialecte } from '@/v2019C1/helpers'

import type { Scl } from '@/v2019C1/config'
import type { ChainTestOperation } from '@dialecte/core'

const xmlString = /* xml */ `<SCL></SCL>`

describe('addEntryToHistory', () => {
	describe('Header creation and History item addition', () => {
		type TestCase = {
			description: string
			operations?: Array<
				ChainTestOperation<Scl.Config, Scl.ElementsOf, Scl.ChildrenOf<Scl.ElementsOf>>
			>
			params: {
				filename: string
				header: {
					id?: string
					fileType: string
					nameStructure?: string
					version: 'keep' | 'increment'
					tool: string
				}
				item: {
					who: string
					what: string
				}
			}
			expected: {
				hitemCount: number
				version: string
				revision: string
				headerId: string
			}
		}

		const testCases: TestCase[] = [
			{
				description: 'creates Header, History, and first Hitem when none exist',
				params: {
					filename: 'test file.scd',
					header: {
						fileType: 'SCD',
						version: 'keep',
						tool: 'SET',
					},
					item: {
						who: 'John Doe',
						what: 'Initial creation',
					},
				},
				expected: {
					hitemCount: 1,
					version: '0',
					revision: '1',
					headerId: 'test_file',
				},
			},
			{
				description: 'creates History when Header exists but History does not',
				operations: [
					{
						type: 'addChild',
						tagName: 'Header',
						attributes: {
							id: 'test_file',
							toolID: 'SET',
							fileType: 'SCD',
							version: '0',
							revision: '1',
						},
					},
				],
				params: {
					filename: 'test_file.scd',
					header: {
						fileType: 'SCD',
						version: 'keep',
						tool: 'SET',
					},
					item: {
						who: 'John Doe',
						what: 'Added history',
					},
				},
				expected: {
					hitemCount: 1,
					version: '0',
					revision: '1',
					headerId: 'test_file',
				},
			},
			{
				description: 'adds Hitem to existing Header and History',
				operations: [
					{
						type: 'addChild',
						tagName: 'Header',
						attributes: {
							id: 'test_file',
							toolID: 'SET',
							fileType: 'SCD',
							version: '0',
							revision: '1',
						},
						setFocus: true,
					},
					{
						type: 'addChild',
						tagName: 'History',
						attributes: {},
						setFocus: true,
					},
					{
						type: 'addChild',
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'Jane Doe',
							what: 'Created',
							version: '0',
							revision: '1',
						},
					},
				],
				params: {
					filename: 'test_file.scd',
					header: {
						fileType: 'SCD',
						version: 'keep',
						tool: 'SET',
					},
					item: {
						who: 'John Doe',
						what: 'Updated configuration',
					},
				},
				expected: {
					hitemCount: 2,
					version: '0',
					revision: '2',
					headerId: 'test_file',
				},
			},
			{
				description: 'increments version when version="increment"',
				operations: [
					{
						type: 'addChild',
						tagName: 'Header',
						attributes: {
							id: 'test_file',
							toolID: 'SET',
							fileType: 'SCD',
							version: '2',
							revision: '3',
						},
						setFocus: true,
					},
					{
						type: 'addChild',
						tagName: 'History',
						attributes: {},
						setFocus: true,
					},
					{
						type: 'addChild',
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'Jane Doe',
							what: 'Created',
							version: '2',
							revision: '3',
						},
					},
				],
				params: {
					filename: 'test_file.scd',
					header: {
						fileType: 'SCD',
						version: 'increment',
						tool: 'SET',
					},
					item: {
						who: 'John Doe',
						what: 'Major update',
					},
				},
				expected: {
					hitemCount: 2,
					version: '3',
					revision: '4',
					headerId: 'test_file',
				},
			},
			{
				description: 'uses custom header id when provided',
				params: {
					filename: 'test file.scd',
					header: {
						id: 'custom_id',
						fileType: 'FSD',
						version: 'keep',
						tool: 'SET',
					},
					item: {
						who: 'Admin',
						what: 'Custom ID test',
					},
				},
				expected: {
					hitemCount: 1,
					version: '0',
					revision: '1',
					headerId: 'custom_id',
				},
			},
			{
				description: 'handles filename with spaces - converts to snake_case for header id',
				params: {
					filename: 'My Test File.scd',
					header: {
						fileType: 'ASD',
						version: 'keep',
						tool: 'SET',
					},
					item: {
						who: 'User',
						what: 'Filename test',
					},
				},
				expected: {
					hitemCount: 1,
					version: '0',
					revision: '1',
					headerId: 'my_test_file',
				},
			},
			{
				description: 'adds multiple Hitems sequentially',
				operations: [
					{
						type: 'addChild',
						tagName: 'Header',
						attributes: {
							id: 'test_file',
							toolID: 'SET',
							fileType: 'SCD',
							version: '0',
							revision: '1',
						},
						setFocus: true,
					},
					{
						type: 'addChild',
						tagName: 'History',
						attributes: {},
						setFocus: true,
					},
					{
						type: 'addChild',
						tagName: 'Hitem',
						attributes: {
							when: 'Mon Jan 27 10:00:00 CET 2026',
							who: 'Jane Doe',
							what: 'Created',
							version: '0',
							revision: '1',
						},
						setFocus: false,
					},
					{
						type: 'addChild',
						tagName: 'Hitem',
						attributes: {
							when: 'Tue Jan 28 11:00:00 CET 2026',
							who: 'John Doe',
							what: 'Updated',
							version: '0',
							revision: '2',
						},
					},
				],
				params: {
					filename: 'test_file.scd',
					header: {
						fileType: 'SCD',
						version: 'keep',
						tool: 'SET',
					},
					item: {
						who: 'Admin',
						what: 'Third update',
					},
				},
				expected: {
					hitemCount: 3,
					version: '0',
					revision: '3',
					headerId: 'test_file',
				},
			},
		]

		testCases.forEach(testAddEntryToHistory)

		function testAddEntryToHistory(testCase: TestCase) {
			it(testCase.description, async () => {
				const {
					expected,
					params: { filename, header, item },
				} = testCase

				// Arrange
				const { dialecte, cleanup } = await createSclTestDialecte({
					xmlString,
				})

				if (testCase.operations) {
					await executeTableDrivenTestsChainOperations({
						chain: dialecte.fromRoot(),
						operations: testCase.operations,
					})
				}

				// Act
				await dialecte.fromRoot().addEntryToHistory({ filename, header, item }).commit()

				// Assert - Check structure
				const {
					Header: headers,
					History: histories,
					Hitem: hitems,
				} = await dialecte.fromRoot().findDescendants({
					tagName: 'Header',
					descendant: { tagName: 'History', descendant: { tagName: 'Hitem' } },
				})

				expect(headers.length).toBe(1)
				expect(histories.length).toBe(1)
				expect(hitems.length).toBe(expected.hitemCount)
				// Assert - Check last Hitem attributes
				const lastHitem = await dialecte
					.fromElement({ tagName: 'History', id: histories[0].id })
					.getLatestHitem()
				expect(lastHitem).toBeDefined()

				assert(lastHitem, 'Last Hitem should be defined')

				const { who, what, version, revision, when } = await dialecte
					.fromElement({ tagName: 'Hitem', id: lastHitem.id })
					.getAttributesValues()

				expect(who).toBe(item.who)
				expect(what).toBe(item.what)
				expect(version).toBe(expected.version)
				expect(revision).toBe(expected.revision)
				expect(when).toMatch(/\w{3} \w{3} \d{2} \d{2}:\d{2}:\d{2} [\w+-]+ \d{4}/)

				const { id: headerId } = await dialecte
					.fromElement({ tagName: 'Header', id: headers[0].id })
					.getAttributesValues()

				// Assert - Check Header id
				expect(headerId).toBe(expected.headerId)

				// Cleanup
				await cleanup()
			})
		}
	})
})
