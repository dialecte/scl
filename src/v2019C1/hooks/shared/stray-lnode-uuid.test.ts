import nearMissXml from './fixtures/stray-lnode-uuid/near-miss.xml?raw'
import strayXml from './fixtures/stray-lnode-uuid/stray.xml?raw'
import wrongKindXml from './fixtures/stray-lnode-uuid/wrong-kind.xml?raw'

import { createDiagnostic, toDialecteError } from '@dialecte/core'
import { describe, expect, it } from 'vitest'

import { SCL_IMPORT_DIAGNOSTICS } from '@/v2019C1/errors'
import { readAttribute } from '@/v2019C1/helpers'
import { ALL_XMLNS_NAMESPACES, createSclTestProject, runSclTestCases } from '@/v2019C1/test'

import type { NormalisedReferenceGroups } from './stray-lnode-uuid.types'
import type { Scl } from '@/v2019C1/config'
import type { SclImportDiagnostic } from '@/v2019C1/errors'
import type { SclTest } from '@/v2019C1/test'

const FB = { tagName: 'BehaviorDescription', id: 'fb' } as Scl.Ref<Scl.ElementsOf>
const TRIP = { tagName: 'InputVar', id: 'fb-trip' } as Scl.Ref<Scl.ElementsOf>

describe('import of a behaviour variable repeating in lnodeUuid the LNode of its input', () => {
	type TestCase = {
		xml: string
		expectedDiagnostics: SclImportDiagnostic[]
		/** The variable's group-1 attributes once imported (`undefined`: absent). */
		expectedAttributes: { lnodeUuid: string | undefined; dataName: string | undefined }
	}

	const testCases: Record<string, TestCase> = {
		// stray.xml: FB's Trip input names GAPC2's Trip by name and uuid, and holds GAPC2's uuid beside them
		'lnodeUuid naming the LNode holding its input → kept as read, no dataName written, redundant-lnode-uuid':
			{
				xml: strayXml,
				expectedDiagnostics: [
					createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'redundant-lnode-uuid', {
						ref: { tagName: 'InputVar', id: 'fb-trip' },
						meta: { lnodeUuid: 'ln-gapc', kept: 'inputUuid' },
					}),
				],
				expectedAttributes: { lnodeUuid: 'ln-gapc', dataName: undefined },
			},
		// near-miss.xml: the same input, holding XCBR1's uuid beside it, an LNode that does not hold the input
		'lnodeUuid naming another LNode → kept as read, exclusive-reference-groups as before': {
			xml: nearMissXml,
			expectedDiagnostics: [
				createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'exclusive-reference-groups', {
					ref: { tagName: 'InputVar', id: 'fb-trip' },
					meta: { attributes: ['lnodeUuid', 'inputName', 'inputUuid'] },
				}),
			],
			expectedAttributes: { lnodeUuid: 'ln-xcbr', dataName: 'XCBR1' },
		},
		// wrong-kind.xml: FB's input names GAPC2's Op output by uuid (a ControlRef, no input), holding GAPC2's uuid beside it
		'lnodeUuid of the LNode holding what an input may not name → kept as read, exclusive-reference-groups':
			{
				xml: wrongKindXml,
				expectedDiagnostics: [
					createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'exclusive-reference-groups', {
						ref: { tagName: 'InputVar', id: 'fb-trip' },
						meta: { attributes: ['lnodeUuid', 'inputUuid'] },
					}),
					createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'unwritten-reference-path', {
						ref: { tagName: 'InputVar', id: 'fb-trip', attribute: 'inputName' },
						meta: {
							uuidAttribute: 'inputUuid',
							uuidValue: 'cr-op',
							reason: 'wrong-target' as const,
						},
					}),
				],
				expectedAttributes: { lnodeUuid: 'ln-gapc', dataName: 'GAPC2' },
			},
	}

	for (const [description, testCase] of Object.entries(testCases)) {
		it(description, async () => {
			const { project } = await createSclTestProject({
				sourceXml: `<SCL ${ALL_XMLNS_NAMESPACES}></SCL>`,
			})
			const [entry] = await project.import(
				[new File([testCase.xml], 'file.ssd', { type: 'text/xml' })],
				{ useCustomRecordsIds: true },
			)
			if (entry?.status !== 'imported') throw new Error('file.ssd not imported')
			expect(entry.diagnostics).toEqual(testCase.expectedDiagnostics)
			const record = await project.openDocument(entry.documentId).query.getRecord(TRIP)
			expect({
				lnodeUuid: record
					? readAttribute({ record, name: 'lnodeUuid', defaults: 'none' }) || undefined
					: undefined,
				dataName: record
					? readAttribute({ record, name: 'dataName', defaults: 'none' }) || undefined
					: undefined,
			}).toEqual(testCase.expectedAttributes)
		})
	}
})

describe('the commit drops the lnodeUuid a written behaviour variable only repeats', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// stray.xml: FB gets a second input of the stored shape, as a copy or an instantiate creates it
		'a variable created naming its input and repeating its LNode → committed without lnodeUuid nor dataName':
			{
				sourceXml: strayXml,
				expectedQueries: [
					'//v2019C1:InputVar[@varName="trip2"][@inputUuid="sr-trip"][@inputName="GAPC2.Trip"][not(@lnodeUuid)][not(@dataName)]',
				],
			},
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		const created = source.transaction(async function createStray(tx) {
			await tx.any.addChild(FB, {
				tagName: 'InputVar',
				attributes: {
					varName: 'trip2',
					inputName: 'GAPC2.Trip',
					inputUuid: 'sr-trip',
					lnodeUuid: 'ln-gapc',
				},
			})
		})
		await expect(created).resolves.toBeUndefined()
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit preview lists the variable it drops a repeated lnodeUuid of, and refuses a near miss', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		lnodeUuid: string
		expected: { normalised: NormalisedReferenceGroups[]; refusals: string[]; commit: string }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// stray.xml: FB gets a second input repeating GAPC2, the LNode holding the SourceRef its inputUuid names
		'repeating the LNode of its input → listed with that LNode, no refusal, committed': {
			sourceXml: strayXml,
			lnodeUuid: 'ln-gapc',
			expected: {
				normalised: [
					{
						element: { tagName: 'InputVar', id: 'trip2' },
						removed: ['dataName', 'lnodeUuid'],
						kept: 'inputUuid',
						lnode: { tagName: 'LNode', id: 'gapc2' },
					},
				],
				refusals: [],
				commit: 'committed',
			},
		},
		// stray.xml: FB gets a second input naming GAPC2's Trip, holding XCBR1's uuid, an LNode that does not hold it
		'naming another LNode → not listed, refused groups-together': {
			sourceXml: strayXml,
			lnodeUuid: 'ln-xcbr',
			expected: {
				normalised: [],
				refusals: ['groups-together inputUuid', 'data-missing lnodeUuid'],
				commit: 'REFERENCE_INCOHERENT',
			},
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		let normalised: NormalisedReferenceGroups[] = []
		let refusals: string[] = []
		const commit = source
			.transaction(async function createAndPreview(tx) {
				await tx.any.addChild(FB, {
					tagName: 'InputVar',
					id: 'trip2',
					attributes: {
						varName: 'trip2',
						inputName: 'GAPC2.Trip',
						inputUuid: 'sr-trip',
						lnodeUuid: testCase.lnodeUuid,
					},
				})
				const preview = await tx.cleanUp.commitPrune({ collect: true })
				normalised = preview.normalised
				refusals = preview.refusals.map((refusal) =>
					refusal.key === 'REFERENCE_INCOHERENT'
						? `${refusal.meta.reason} ${refusal.meta.uuidAttribute}`
						: refusal.key,
				)
			})
			.then(
				() => 'committed',
				(error: unknown) => toDialecteError(error)?.key ?? String(error),
			)
		await expect(
			commit.then((outcome) => ({ normalised, refusals, commit: outcome })),
		).resolves.toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('the import of a behaviour variable repeating the LNode of its input tells its path fills to their total', () => {
	// stray.xml: FB's Trip input repeats GAPC2's uuid, its path left unwritten; its pos input's path is filled
	it('stray.xml imported → the path-fills step counts the one fill it runs, to its total', async () => {
		const { project } = await createSclTestProject({
			sourceXml: `<SCL ${ALL_XMLNS_NAMESPACES}></SCL>`,
		})
		const told: { done: number | undefined; total: number | undefined }[] = []
		await project.import([new File([strayXml], 'file.ssd', { type: 'text/xml' })], {
			useCustomRecordsIds: true,
			onProgress: function keepPathFills(progress) {
				if (progress.phase === 'processing' && progress.step === 'path-fills')
					told.push({ done: progress.done, total: progress.total })
			},
		})
		expect(told.at(-1)).toEqual({ done: 1, total: 1 })
	})
})
