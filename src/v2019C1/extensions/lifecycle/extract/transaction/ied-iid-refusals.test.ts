/// <reference types="vite/client" />

import RealIedConnectedXml from './fixtures/cid-real-ied-connected.xml?raw'
import SpecificationIedConnectedXml from './fixtures/cid-specification-ied-connected.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { IidExtractParams } from './ied.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	options?: Record<string, unknown>
	expectedRefusal: { key: string; meta?: Record<string, unknown> }
}

const IID = {
	fileType: 'IID',
	iedRef: { tagName: 'IED', id: 'selected-ied' },
	tool: 'TEST',
	who: 'test',
} as const satisfies Omit<IidExtractParams, 'sourceQuery'>

const emptyTarget = /* xml */ `<SCL ${ns} ${id}="empty-target"/>`

const targetHoldingAnIed = /* xml */ `<SCL ${ns} ${id}="target-holding-an-ied"><IED name="Held" ${id}="held-ied"/></SCL>`

const selectedIedRef = { tagName: 'IED', id: 'selected-ied' }

describe('extract IED as IID - refusals', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		// Selected is a specification IED
		'specification IED -> IED_NOT_IMPLEMENTED, nothing written': {
			sourceXml: SpecificationIedConnectedXml,
			targetXml: emptyTarget,
			expectedRefusal: { key: 'IED_NOT_IMPLEMENTED', meta: { ied: selectedIedRef } },
			expectedQueries: ['/default:SCL[count(*)=0]'],
		},
		// Selected is a real IED with an address
		'substation part asked with a value that is not a boolean -> OPTION_NOT_AVAILABLE, nothing written':
			{
				sourceXml: RealIedConnectedXml,
				targetXml: emptyTarget,
				options: { includeSubstation: 'yes' },
				expectedRefusal: {
					key: 'OPTION_NOT_AVAILABLE',
					meta: { option: 'includeSubstation', value: 'yes' },
				},
				expectedQueries: ['/default:SCL[count(*)=0]'],
			},
		// Selected is a real IED with an address
		'which other IEDs the file holds, an option of a CID -> OPTION_NOT_AVAILABLE, nothing written':
			{
				sourceXml: RealIedConnectedXml,
				targetXml: emptyTarget,
				options: { interactingIeds: 'publishers' },
				expectedRefusal: {
					key: 'OPTION_NOT_AVAILABLE',
					meta: { option: 'interactingIeds', value: 'publishers' },
				},
				expectedQueries: ['/default:SCL[count(*)=0]'],
			},
		// Selected is a real IED with an address
		'what to do with client references, an option of a CID -> OPTION_NOT_AVAILABLE, nothing written':
			{
				sourceXml: RealIedConnectedXml,
				targetXml: emptyTarget,
				options: { clientRefs: 'keep' },
				expectedRefusal: {
					key: 'OPTION_NOT_AVAILABLE',
					meta: { option: 'clientRefs', value: 'keep' },
				},
				expectedQueries: ['/default:SCL[count(*)=0]'],
			},
		// Selected is a real IED with an address
		'revision start -> OPTION_NOT_AVAILABLE, nothing written': {
			sourceXml: RealIedConnectedXml,
			targetXml: emptyTarget,
			options: { as: 'revision' },
			expectedRefusal: { key: 'OPTION_NOT_AVAILABLE', meta: { option: 'as', value: 'revision' } },
			expectedQueries: ['/default:SCL[count(*)=0]'],
		},
		// Selected is a real IED with an address; the target holds the IED Held
		'target already holding an IED -> EXTRACTION_TARGET_NOT_EMPTY, the target unchanged': {
			sourceXml: RealIedConnectedXml,
			targetXml: targetHoldingAnIed,
			expectedRefusal: { key: 'EXTRACTION_TARGET_NOT_EMPTY' },
			expectedQueries: ['/default:SCL[count(*)=1]/default:IED[@name="Held"]'],
		},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const refused = await target
			.transaction(async function exportIid(tx) {
				return tx.lifecycle.extract.ied({
					...IID,
					...(testCase.options as Partial<IidExtractParams>),
					sourceQuery: source.query,
				})
			})
			.then(
				() => undefined,
				(error: unknown) => error,
			)
		const reported = toDialecteError(refused)
		expect({ key: reported?.key, meta: reported?.meta }).toMatchObject(testCase.expectedRefusal)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
