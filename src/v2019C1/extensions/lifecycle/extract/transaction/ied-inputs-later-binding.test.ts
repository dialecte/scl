/// <reference types="vite/client" />

import InputOfAExpectingGooseWithoutServiceTypeXml from './fixtures/input-of-a-expecting-goose-without-service-type.xml?raw'
import InputOfAWithoutExpectedDataFedByRXml from './fixtures/input-of-a-without-expected-data-fed-by-r.xml?raw'
import InputOfAWithoutExpectedServiceXml from './fixtures/input-of-a-without-expected-service.xml?raw'
import InputsOfAFedByAAndByRXml from './fixtures/inputs-of-a-fed-by-a-and-by-r.xml?raw'
import InputsOfAWithoutDescriptionOrExpectedDataXml from './fixtures/inputs-of-a-without-description-or-expected-data.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { ExtractWarning } from './extract.types'
import type { SclTest } from '@/v2019C1/test'

type WarningCase = SclTest.BaseXmlTestCase & { expectedWarnings: ExtractWarning[] }

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const emptyIsd = /* xml */ `<SCL ${ns} ${id}="empty-isd"/>`

const EXPORT = {
	iedRef: { tagName: 'IED', id: 'ied-a' },
	fileType: 'ISD',
	kind: 'instance',
	inputs: 'later-binding',
	issuer: 'TEST_ISSUER',
	tool: 'TEST',
	who: 'engineer',
} as const

describe('every input of the IED is written in later-binding form', () => {
	async function act({
		source,
		target,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async function exportIsd(tx) {
			return tx.lifecycle.extract.ied({ ...EXPORT, sourceQuery: source.query })
		})
		return { assertOn: 'target' }
	}

	const testCases: SclTest.TestCases = {
		'input of RREC fed by gcb1 of A, input of PTOC fed by gcbR of R → both with description, address, expected data and service, no source':
			{
				sourceXml: InputsOfAFedByAAndByRXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:LN[@lnClass="RREC"]/default:Inputs/default:ExtRef[@intAddr="BlockReclose"][@desc="Block reclose"][@pLN="PTRC"][@pDO="Op"][@pDA="general"][@pServT="GOOSE"][@serviceType="GOOSE"][@uuid="70000000-0000-4000-8000-0000000000a2"][not(@iedName or @ldInst or @prefix or @lnClass or @lnInst or @lnUuid or @doName or @daName)][not(@srcLDInst or @srcPrefix or @srcLNClass or @srcLNInst or @srcCBName or @srcCBUuid)]',
					'//default:LN[@lnClass="PTOC"]/default:Inputs/default:ExtRef[@intAddr="RemoteTrip"][@desc="Remote trip"][@pLN="PTRC"][@pDO="Op"][@pDA="general"][@pServT="GOOSE"][@serviceType="GOOSE"][@uuid="70000000-0000-4000-8000-0000000000a5"][not(@iedName or @ldInst or @prefix or @lnClass or @lnInst or @lnUuid or @doName or @daName)][not(@srcLDInst or @srcPrefix or @srcLNClass or @srcLNInst or @srcCBName or @srcCBUuid)]',
				],
				unexpectedQueries: ['//default:IED[@name="R"]'],
			},
		'input fed by gcbR of R with no expected data → the expected data and service taken from the source it was bound to':
			{
				sourceXml: InputOfAWithoutExpectedDataFedByRXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:ExtRef[@intAddr="RemoteTrip"][@desc="Remote trip"][@pLN="PTRC"][@pDO="Op"][@pDA="general"][@pServT="GOOSE"][@serviceType="GOOSE"][not(@iedName or @ldInst or @prefix or @lnClass or @lnInst or @lnUuid or @doName or @daName)][not(@srcLDInst or @srcPrefix or @srcLNClass or @srcLNInst or @srcCBName or @srcCBUuid)]',
				],
			},
		'input with no description, input with an internal address only → each written as it is, without a source':
			{
				sourceXml: InputsOfAWithoutDescriptionOrExpectedDataXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:ExtRef[@intAddr="RemoteTrip"][not(@desc)][@pDO="Op"][@pDA="general"][@pServT="GOOSE"][@serviceType="GOOSE"][not(@iedName or @ldInst or @prefix or @lnClass or @lnInst or @lnUuid or @doName or @daName)][not(@srcLDInst or @srcPrefix or @srcLNClass or @srcLNInst or @srcCBName or @srcCBUuid)]',
					'//default:ExtRef[@intAddr="Spare"][not(@desc or @pDO or @pServT or @serviceType)]',
				],
			},
		'input expecting a GOOSE service with no service type → its service type written equal to it': {
			sourceXml: InputOfAExpectingGooseWithoutServiceTypeXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'//default:ExtRef[@intAddr="RemoteTrip"][@desc="Remote trip"][@pDO="Op"][@pServT="GOOSE"][@serviceType="GOOSE"]',
			],
		},
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('an input mode the export does not offer is refused', () => {
	async function act({
		source,
		target,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const sourceBefore = await source.query.getSnapshot({ as: 'tree', unwrap: [] })
		const targetBefore = await target.query.getSnapshot({ as: 'tree', unwrap: [] })
		const outcome = await target.transaction(async function exportIsd(tx) {
			const stagedBefore = [...tx.getStagedOperations()]
			const refused = await tx.lifecycle.extract
				.ied({
					...EXPORT,
					// a caller without the types may pass any value
					inputs: 'bound' as unknown as 'none',
					sourceQuery: source.query,
				})
				.then(
					() => undefined,
					(error: unknown) => error,
				)
			return { refused, stagedBefore, stagedAfter: [...tx.getStagedOperations()] }
		})
		expect(toDialecteError(outcome.refused)?.key).toBe('OPTION_NOT_AVAILABLE')
		expect(outcome.stagedAfter).toEqual(outcome.stagedBefore)
		const sourceAfter = await source.query.getSnapshot({ as: 'tree', unwrap: [] })
		const targetAfter = await target.query.getSnapshot({ as: 'tree', unwrap: [] })
		expect(sourceAfter).toEqual(sourceBefore)
		expect(targetAfter).toEqual(targetBefore)
	}

	const testCases: SclTest.TestCases = {
		'inputs of a mode neither none nor later-binding → refused, nothing written, project unchanged':
			{
				sourceXml: InputsOfAFedByAAndByRXml,
				targetXml: emptyIsd,
			},
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('an input lacking what a later binding needs is listed', () => {
	async function act({ source, target, testCase }: SclTest.ActParams<WarningCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const { warnings } = await target.transaction(async function exportIsd(tx) {
			return tx.lifecycle.extract.ied({ ...EXPORT, sourceQuery: source.query })
		})
		// the inputs are read by tag, not in document order
		expect(warnings).toHaveLength(testCase.expectedWarnings.length)
		expect(warnings).toEqual(expect.arrayContaining(testCase.expectedWarnings))
	}

	const testCases: SclTest.TestCases<WarningCase> = {
		'input with no description, input with an internal address only → each listed with what it lacks':
			{
				sourceXml: InputsOfAWithoutDescriptionOrExpectedDataXml,
				targetXml: emptyIsd,
				expectedWarnings: [
					{
						code: 'input-incomplete',
						source: { tagName: 'ExtRef', id: 'input-without-description' },
						missing: ['desc'],
					},
					{
						code: 'input-incomplete',
						source: { tagName: 'ExtRef', id: 'input-address-only' },
						missing: ['desc', 'pDO', 'serviceType'],
					},
				],
			},
		'input with no expected service nor service type → listed, its service type missing': {
			sourceXml: InputOfAWithoutExpectedServiceXml,
			targetXml: emptyIsd,
			expectedWarnings: [
				{
					code: 'input-incomplete',
					source: { tagName: 'ExtRef', id: 'input-without-service' },
					missing: ['serviceType'],
				},
			],
		},
		'input fed by gcbR of R with no expected data → nothing listed, the expected data is derived': {
			sourceXml: InputOfAWithoutExpectedDataFedByRXml,
			targetXml: emptyIsd,
			expectedWarnings: [],
		},
	}

	runSclTestCases.withoutExport({ testCases, act })
})
