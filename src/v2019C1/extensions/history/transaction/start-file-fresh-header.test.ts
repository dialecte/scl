import { toDialecteError } from '@dialecte/core'
import { describe, expect, vi } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { StartFileParams } from './start-file.types'
import type { SclTest } from '@/v2019C1/test'

const oldUuid = '40000000-0000-4000-8000-000000000001'
const TIMESTAMP_PRECISION_SLACK_MS = 2_000
const oldHeader = /* xml */ `
	<Header id="prior_target" toolID="OLD_TOOL" fileType="SCD" version="7" revision="9" uuid="${oldUuid}" baseUuid="40000000-0000-4000-8000-000000000002">
		<Text>Old identity description</Text>
		<History>
			<Hitem version="6" revision="3" when="2024-01-02T03:04:05Z" who="old-user-a" what="old-event-a" why="old-reason-a">First target history text.</Hitem>
			<Hitem version="7" revision="9" when="2025-02-03T04:05:06Z" who="old-user-b" what="old-event-b" why="old-reason-b">Second target history text.</Hitem>
		</History>
	</Header>
`

type TestCase = SclTest.BaseXmlTestCase & {
	fileType: 'ISD' | 'FSD' | 'ASD' | 'SSD'
	hasHistory: boolean
	rollback?: boolean
}

describe('startFile fresh target identity', () => {
	const testCases: Record<string, TestCase> = Object.fromEntries(
		(['ISD', 'FSD', 'ASD', 'SSD'] as const).map((fileType) => [
			`${fileType} with prior target history -> one fresh initialization with historical inner text`,
			{
				sourceXml: `<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="target-root">${oldHeader}</SCL>`,
				fileType,
				hasHistory: true,
				rollback: fileType === 'FSD',
				expectedQueries: [
					`/default:SCL[count(default:Header)=1]/default:Header[@id="${fileType.toLowerCase()}_new_target"][@fileType="${fileType}"][@toolID="CURRENT_TOOL"][@nameStructure="IEDName"][@version="0"][@revision="1"][not(@baseUuid)][not(default:Text)]/default:History[count(default:Hitem)=1]/default:Hitem[@version="0"][@revision="1"][@who="current-user"][@what="New initialization"][@why="New extraction"][string-length(@when)>0]`,
				],
			},
		]),
	)
	testCases['SSD with old Header but no History -> fresh identity without inherited attributes'] = {
		sourceXml: `<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="target-root">${oldHeader.replace(/<History>[\s\S]*<\/History>/, '')}</SCL>`,
		fileType: 'SSD',
		hasHistory: false,
		expectedQueries: [
			'/default:SCL[count(default:Header)=1]/default:Header[@id="ssd_new_target"][@fileType="SSD"][@toolID="CURRENT_TOOL"][@nameStructure="IEDName"][@version="0"][@revision="1"][not(@baseUuid)][not(default:Text)]/default:History[count(default:Hitem)=1]/default:Hitem[@version="0"][@revision="1"]',
		],
	}

	async function act({
		source,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const params: StartFileParams = {
			as: 'new',
			filename: `${testCase.fileType}_New Target.scl`,
			header: { fileType: testCase.fileType, tool: 'CURRENT_TOOL', nameStructure: 'IEDName' },
			item: { who: 'current-user', what: 'New initialization', why: 'New extraction' },
		}
		const before = await source.query.getSnapshot({ as: 'xml' })
		const metadata = await source.query.getDocumentInfo()
		const metadataBefore = structuredClone(metadata)
		let staged: string | undefined
		if (testCase.rollback) {
			const revision = source.transaction(async function refuseRevision(tx) {
				const add = vi.spyOn(tx, 'addChild')
				const update = vi.spyOn(tx, 'update')
				const remove = vi.spyOn(tx, 'delete')
				try {
					const refused = tx.history.startFile({ ...params, as: 'revision' })
					await expect(refused).rejects.toBeInstanceOf(Error)
					const rejection = await refused.catch((error: unknown) => error)
					expect(toDialecteError(rejection)).toMatchObject({
						key: 'OPTION_NOT_AVAILABLE',
						meta: { option: 'as', value: 'revision' },
					})
					expect(add).not.toHaveBeenCalled()
					expect(update).not.toHaveBeenCalled()
					expect(remove).not.toHaveBeenCalled()
				} finally {
					add.mockRestore()
					update.mockRestore()
					remove.mockRestore()
				}
			})
			await expect(revision).resolves.toBeUndefined()
			const afterRevision = await source.query.getSnapshot({ as: 'xml' })
			const metadataAfterRevision = await source.query.getDocumentInfo()
			expect(afterRevision).toBe(before)
			expect(metadataAfterRevision).toEqual(metadataBefore)
			const sentinel = new Error('rollback after starting a fresh file')
			const rollback = source.transaction(async function startThenRollback(tx) {
				await tx.history.startFile(params)
				staged = await tx.getSnapshot({ as: 'xml' })
				throw sentinel
			})
			await expect(rollback).rejects.toBeInstanceOf(Error)
			const rejection = await rollback.catch((error: unknown) => error)
			const reported = toDialecteError(rejection)
			expect(reported?.key).toBe('UNKNOWN')
			expect(reported?.cause).toBe(sentinel)
			const afterRollback = await source.query.getSnapshot({ as: 'xml' })
			const metadataAfterRollback = await source.query.getDocumentInfo()
			expect(afterRollback).toBe(before)
			expect(metadataAfterRollback).toEqual(metadataBefore)
		}
		const operationStart = Date.now()
		await source.transaction(async function start(tx) {
			await tx.history.startFile(params)
		})
		const operationEnd = Date.now()
		const headers = await source.query.getRecordsByTagName('Header')
		expect(headers).toHaveLength(1)
		const uuid = await source.query.getAttribute(headers[0], { name: 'uuid' })
		expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
		expect(uuid).not.toBe(oldUuid)
		const histories = await source.query.getRecordsByTagName('History')
		expect(histories).toHaveLength(1)
		const items = await source.query.getRecordsByTagName('Hitem')
		expect(items).toHaveLength(1)
		const attributes = await source.query.getAttributes(items[0])
		expect(attributes).toMatchObject({
			version: '0',
			revision: '1',
			who: 'current-user',
			what: 'New initialization',
			why: 'New extraction',
		})
		// The native history formatter drops milliseconds; bracket the operation, not its duration.
		const initializedAt = Date.parse(attributes.when ?? '')
		expect(Number.isFinite(initializedAt)).toBe(true)
		expect(initializedAt).toBeGreaterThanOrEqual(operationStart - TIMESTAMP_PRECISION_SLACK_MS)
		expect(initializedAt).toBeLessThanOrEqual(operationEnd + TIMESTAMP_PRECISION_SLACK_MS)
		const xml = await source.query.getSnapshot({ as: 'xml' })
		if (testCase.hasHistory) {
			for (const output of [xml, ...(staged ? [staged] : [])]) {
				const text = output.match(/<Hitem\b[^>]*>([\s\S]*?)<\/Hitem>/)?.[1]?.replace(/\s+/g, ' ')
				expect(text).toContain('First target history text.')
				expect(text).toContain('Second target history text.')
				expect(text!.indexOf('First target history text.')).toBeLessThan(
					text!.indexOf('Second target history text.'),
				)
				expect(text).toMatch(/histor(?:y|ical).*context/i)
			}
		}
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
