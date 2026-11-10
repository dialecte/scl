import { toDialecteError } from '@dialecte/core'
import { describe, expect, vi } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const sourceUuid = '10000000-0000-4000-8000-000000000001'
const priorUuid = '40000000-0000-4000-8000-000000000001'
const TIMESTAMP_PRECISION_SLACK_MS = 2_000
const ns = ALL_XMLNS_NAMESPACES
const id = CUSTOM_RECORD_ID_ATTRIBUTE

describe('extract IED into a target with prior Header history', () => {
	const testCases: SclTest.TestCases = {
		'Selected instance inputs none -> fresh ISD identity and merged prior target text, rollback and retry':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="source-root">
						<Header id="source_project" fileType="SCD" toolID="SOURCE_TOOL" uuid="${sourceUuid}" version="2" revision="B">
							<History>
								<Hitem version="2" revision="B" when="2025-01-01" who="source-user" what="Source event" why="Source reason">Source-only history text.</Hitem>
							</History>
						</Header>
						<IED name="Selected" manufacturer="SOURCE_ISSUER" uuid="20000000-0000-4000-8000-000000000001" ${id}="selected-ied">
							<AccessPoint name="AP1" uuid="30000000-0000-4000-8000-000000000001">
								<Server>
									<Authentication/>
									<LDevice inst="LD1">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type">
											<Inputs>
												<ExtRef iedName="Selected" ldInst="LD1" lnClass="LLN0" doName="Status" daName="stVal" intAddr="self"/>
											</Inputs>
										</LN0>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<DataTypeTemplates>
							<LNodeType id="LLN0_Type" lnClass="LLN0">
								<DO name="Status" type="Status_Type"/>
							</LNodeType>
							<DOType id="Status_Type" cdc="SPS">
								<DA name="stVal" bType="BOOLEAN" fc="ST"/>
							</DOType>
						</DataTypeTemplates>
					</SCL>
				`,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="target-root">
						<Header id="old_target" toolID="OLD_TOOL" fileType="SSD" uuid="${priorUuid}" baseUuid="40000000-0000-4000-8000-000000000002" version="8" revision="6">
							<History>
								<Hitem version="7" revision="2" when="2024-01-01" who="old-a" what="Old A" why="Old reason A">Target first historical text.</Hitem>
								<Hitem version="8" revision="6" when="2025-02-02" who="old-b" what="Old B" why="Old reason B">Target second historical text.</Hitem>
							</History>
						</Header>
					</SCL>
				`,
				expectedQueries: [
					'/default:SCL[count(default:Header)=1]/default:Header[@id="isd_selected"][@fileType="ISD"][@toolID="CURRENT_TOOL"][@nameStructure="IEDName"][@version="0"][@revision="1"][not(@baseUuid)]/default:History[count(default:Hitem)=1]/default:Hitem[@version="0"][@revision="1"][@who="current-user"][@what="ISD initialization"][@why="IED specification was extracted from a previous file"][string-length(@when)>0]',
					'/default:SCL[count(default:IED)=1]/default:IED[@name="Selected"][@manufacturer="CURRENT_ISSUER"][@uuid="20000000-0000-4000-8000-000000000001"]/default:AccessPoint[@name="AP1"]/default:Server/default:LDevice[@inst="LD1"]/default:LN0[@lnType="LLN0_Type"]',
					'/default:SCL/default:Header/default:SourceFiles[count(default:SclFileReference)=1]',
					'/default:SCL/default:IED/default:IEDSourceFiles[count(default:SclFileReference)=1]',
				],
				unexpectedQueries: ['//default:Inputs', '//default:ExtRef'],
			},
	}

	async function act({
		source,
		target,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const sourceBefore = await source.query.getSnapshot({ as: 'xml' })
		const sourceMetadata = await source.query.getDocumentInfo()
		const sourceMetadataBefore = structuredClone(sourceMetadata)
		const targetBefore = await target.query.getSnapshot({ as: 'xml' })
		const targetMetadata = await target.query.getDocumentInfo()
		const targetMetadataBefore = structuredClone(targetMetadata)
		const params = {
			sourceQuery: source.query,
			iedRef: { tagName: 'IED', id: 'selected-ied' },
			fileType: 'ISD',
			kind: 'instance',
			inputs: 'none',
			issuer: 'CURRENT_ISSUER',
			tool: 'CURRENT_TOOL',
			who: 'current-user',
			nameStructure: 'IEDName',
		} as const
		try {
			const revision = target.transaction(async function refuseRevision(tx) {
				const add = vi.spyOn(tx, 'addChild')
				const update = vi.spyOn(tx, 'update')
				const remove = vi.spyOn(tx, 'delete')
				try {
					const refused = tx.lifecycle.extract.ied({ ...params, as: 'revision' })
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
			const afterRevision = await target.query.getSnapshot({ as: 'xml' })
			const metadataAfterRevision = await target.query.getDocumentInfo()
			expect(afterRevision).toBe(targetBefore)
			expect(metadataAfterRevision).toEqual(targetMetadataBefore)
			const sentinel = new Error('rollback after extraction into existing Header')
			let staged: string | undefined
			const rollback = target.transaction(async function extractThenRollback(tx) {
				await expect(tx.lifecycle.extract.ied(params)).resolves.toEqual({ warnings: [] })
				staged = await tx.getSnapshot({ as: 'xml' })
				throw sentinel
			})
			await expect(rollback).rejects.toBeInstanceOf(Error)
			const rejection = await rollback.catch((error: unknown) => error)
			const reported = toDialecteError(rejection)
			expect(reported?.key).toBe('UNKNOWN')
			expect(reported?.cause).toBe(sentinel)
			const afterRollback = await target.query.getSnapshot({ as: 'xml' })
			const metadataAfterRollback = await target.query.getDocumentInfo()
			expect(afterRollback).toBe(targetBefore)
			expect(metadataAfterRollback).toEqual(targetMetadataBefore)
			const operationStart = Date.now()
			await target.transaction(async function retry(tx) {
				await expect(tx.lifecycle.extract.ied(params)).resolves.toEqual({ warnings: [] })
			})
			const operationEnd = Date.now()
			const provenance = await target.query.reference.getProvenance()
			expect(provenance).toHaveLength(2)
			expect(provenance.map((entry) => entry.anchor.kind).sort()).toEqual(['document', 'ied'])
			for (const entry of provenance) {
				expect(entry).toMatchObject({
					fileUuid: sourceUuid,
					fileType: 'SCD',
					fileName: 'source.xml',
					version: '2',
					revision: 'B',
				})
			}
			const headers = await target.query.getRecordsByTagName('Header')
			expect(headers).toHaveLength(1)
			const uuid = await target.query.getAttribute(headers[0], { name: 'uuid' })
			expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
			expect(uuid).not.toBe(priorUuid)
			expect(uuid).not.toBe(sourceUuid)
			const histories = await target.query.getRecordsByTagName('History')
			const items = await target.query.getRecordsByTagName('Hitem')
			expect(histories).toHaveLength(1)
			expect(items).toHaveLength(1)
			const attributes = await target.query.getAttributes(items[0])
			// The native history formatter drops milliseconds; bracket the operation, not its duration.
			const initializedAt = Date.parse(attributes.when ?? '')
			expect(Number.isFinite(initializedAt)).toBe(true)
			expect(initializedAt).toBeGreaterThanOrEqual(operationStart - TIMESTAMP_PRECISION_SLACK_MS)
			expect(initializedAt).toBeLessThanOrEqual(operationEnd + TIMESTAMP_PRECISION_SLACK_MS)
			const xml = await target.query.getSnapshot({ as: 'xml' })
			for (const output of [staged!, xml]) {
				const text = output.match(/<Hitem\b[^>]*>([\s\S]*?)<\/Hitem>/)?.[1]?.replace(/\s+/g, ' ')
				expect(text).toContain('Target first historical text.')
				expect(text).toContain('Target second historical text.')
				expect(text!.indexOf('Target first historical text.')).toBeLessThan(
					text!.indexOf('Target second historical text.'),
				)
				expect(text).toMatch(/histor(?:y|ical).*context/i)
				expect(text).not.toContain('Source-only history text.')
			}
		} finally {
			const sourceAfter = await source.query.getSnapshot({ as: 'xml' })
			const sourceMetadataAfter = await source.query.getDocumentInfo()
			expect(sourceAfter).toBe(sourceBefore)
			expect(sourceMetadataAfter).toEqual(sourceMetadataBefore)
		}
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
