import unsubscribeBound from '../../extensions/dataflow/transaction/fixtures/unsubscribe/unsubscribe-bound.xml?raw'
import { subscriptionBookkeeping } from './subscription-bookkeeping'

import { toRawRecord, widen } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'

// P publishes gcb to S and T. S holds the last two GOOSE ExtRefs to finish and an LGOS value naming gcb.
describe('the commit finishes ended subscriptions', () => {
	runSclTestCases.withExport({
		testCases: {
			'the last ExtRef of a subscriber deleted -> its registration and supervision go': {
				// S has two GOOSE inputs on P's gcb and the LGOS value that supervises it; T remains subscribed.
				sourceXml: unsubscribeBound,
				expectedQueries: ['//default:IED[@name="P"]//default:GSEControl/default:IEDName[.="T"]'],
				unexpectedQueries: [
					'//default:IED[@name="S"]//default:ExtRef[@intAddr="in1"]',
					'//default:IED[@name="P"]//default:GSEControl/default:IEDName[.="S"]',
					'//default:IED[@name="S"]//default:LN[@lnClass="LGOS"]//default:Val',
				],
			},
		},
		act: async ({ source }) => {
			await source.transaction(async function deleteSubscriptions(tx) {
				await tx.delete({ tagName: 'ExtRef', id: 'ext-s-general' })
				await tx.delete({ tagName: 'ExtRef', id: 'ext-s-q' })
			})
			return { assertOn: 'source' }
		},
	})
})

describe('the commit includes a deleted subscriber subtree', () => {
	runSclTestCases.withExport({
		testCases: {
			'the logical node holding the last subscriptions deleted -> registration and supervision go':
				{
					// S's GGIO holds both GOOSE inputs and is deleted with them; its LGOS is outside that subtree.
					sourceXml: unsubscribeBound,
					expectedQueries: ['//default:IED[@name="P"]//default:GSEControl/default:IEDName[.="T"]'],
					unexpectedQueries: [
						'//default:IED[@name="P"]//default:GSEControl/default:IEDName[.="S"]',
						'//default:IED[@name="S"]//default:LN[@lnClass="LGOS"]//default:Val',
					],
				},
		},
		act: async ({ source }) => {
			await source.transaction(async function deleteSubscriber(tx) {
				await tx.delete({ tagName: 'LN', id: 'ln-s-ggio1' })
			})
			return { assertOn: 'source' }
		},
	})
})

describe('the commit detects a subscription cleared without unsubscribe', () => {
	runSclTestCases.withExport({
		testCases: {
			'all source attributes of the last ExtRefs cleared -> their registration and supervision go':
				{
					// Clearing S's complete bindings leaves its internal addresses and P's gcb registrations.
					sourceXml: unsubscribeBound,
					expectedQueries: [
						'//default:IED[@name="S"]//default:ExtRef[@intAddr="in1"][not(@srcCBName)]',
						'//default:IED[@name="P"]//default:GSEControl/default:IEDName[.="T"]',
					],
					unexpectedQueries: [
						'//default:IED[@name="P"]//default:GSEControl/default:IEDName[.="S"]',
						'//default:IED[@name="S"]//default:LN[@lnClass="LGOS"]//default:Val',
					],
				},
		},
		act: async ({ source }) => {
			await source.transaction(async function clearSubscriptions(tx) {
				const attributes = {
					iedName: undefined,
					ldInst: undefined,
					prefix: undefined,
					lnClass: undefined,
					lnInst: undefined,
					lnUuid: undefined,
					doName: undefined,
					daName: undefined,
					serviceType: undefined,
					srcLDInst: undefined,
					srcPrefix: undefined,
					srcLNClass: undefined,
					srcLNInst: undefined,
					srcCBUuid: undefined,
					srcCBName: undefined,
				} as unknown as Record<string, string>
				await tx.any.update({ tagName: 'ExtRef', id: 'ext-s-general' }, { attributes })
				await tx.any.update({ tagName: 'ExtRef', id: 'ext-s-q' }, { attributes })
			})
			return { assertOn: 'source' }
		},
	})
})

describe('the commit finishes subscriptions to a deleted publisher control block', () => {
	runSclTestCases.withExport({
		testCases: {
			'a subscribed GOOSE control block deleted -> its subscribers lose the control block and their supervision goes':
				{
					// P's gcb has S and T registrations; only S carries an LGOS value naming the block.
					sourceXml: unsubscribeBound,
					expectedQueries: [
						'//default:IED[@name="S"]//default:ExtRef[@intAddr="in1"][not(@srcCBName)]',
						'//default:IED[@name="T"]//default:ExtRef[@intAddr="ti1"][not(@srcCBName)]',
						'//default:IED[@name="S"]//default:LN[@lnClass="LGOS"]/default:DOI[@name="GoCBRef"]',
					],
					unexpectedQueries: [
						'//default:IED[@name="P"]//default:GSEControl[@name="gcb"]',
						'//default:IED[@name="S"]//default:LN[@lnClass="LGOS"]//default:Val',
					],
				},
		},
		act: async ({ source }) => {
			await source.transaction(async function deleteControlBlock(tx) {
				await tx.delete({ tagName: 'GSEControl', id: 'gcb' })
			})
			return { assertOn: 'source' }
		},
	})
})

describe('the commit includes subscription changes from earlier steps', () => {
	runSclTestCases.withoutExport({
		testCases: {
			'an earlier step clears the last subscriptions -> its registration and supervision are planned':
				{
					sourceXml: unsubscribeBound,
				},
		},
		act: async ({ source }) => {
			let resultIds: string[] = []
			await source.transaction(async function planEarlierWrite(tx) {
				const refs = ['ext-s-general', 'ext-s-q']
				const operations: Scl.Operation[] = []
				for (const id of refs) {
					const record = await tx.getRecord({ tagName: 'ExtRef', id })
					expect(record).toBeDefined()
					const updated = {
						...record!,
						attributes: record!.attributes.filter(({ name }) =>
							['intAddr', 'uuid', 'pDO'].includes(name),
						),
					}
					operations.push({
						status: 'updated' as const,
						oldRecord: toRawRecord(widen(record!)),
						newRecord: toRawRecord(widen(updated)),
					})
				}
				const staged = new Map<'moves', Scl.Operation[]>([['moves', operations]])
				const result = await subscriptionBookkeeping({
					plan: {
						operations: [],
						query: tx,
						staged,
						state: {},
						collect: false,
					},
					writes: {
						pending: new Map(
							operations.flatMap((operation) =>
								operation.status === 'updated'
									? [[operation.newRecord.id, operation.newRecord] as const]
									: [],
							),
						),
						gone: new Set(),
					},
				})
				resultIds = result.operations.map((operation) =>
					operation.status === 'deleted' ? operation.oldRecord.id : operation.newRecord.id,
				)
			})
			expect(resultIds).toEqual(expect.arrayContaining(['iedname-s', 'val-lgos-s']))
		},
	})
})
