import RealIedConnectedXml from './fixtures/cid-real-ied-connected.xml?raw'
/// <reference types="vite/client" />
import RealIedConnectionWithoutAddressXml from './fixtures/cid-real-ied-connection-without-address.xml?raw'
import RealIedUnconnectedXml from './fixtures/cid-real-ied-unconnected.xml?raw'
import SpecificationIedConnectedXml from './fixtures/cid-specification-ied-connected.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { CidExtractParams } from './ied.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	options?: Record<string, unknown>
	expectedRefusal: { key: string; meta?: Record<string, unknown> }
}

const CID = {
	fileType: 'CID',
	iedRef: { tagName: 'IED', id: 'selected-ied' },
	interactingIeds: 'none',
	tool: 'TEST',
	who: 'test',
} as const satisfies Omit<CidExtractParams, 'sourceQuery'>

const emptyTarget = /* xml */ `<SCL ${ns} ${id}="empty-target"/>`

const selectedIedRef = { tagName: 'IED', id: 'selected-ied' }

describe('extract IED as CID - refusals', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'specification IED -> IED_NOT_IMPLEMENTED, nothing written': {
			sourceXml: SpecificationIedConnectedXml,
			targetXml: emptyTarget,
			expectedRefusal: { key: 'IED_NOT_IMPLEMENTED', meta: { ied: selectedIedRef } },
			expectedQueries: ['/default:SCL[count(*)=0]'],
		},
		'real IED without a connection -> IED_NOT_CONNECTED, nothing written': {
			sourceXml: RealIedUnconnectedXml,
			targetXml: emptyTarget,
			expectedRefusal: { key: 'IED_NOT_CONNECTED', meta: { ied: selectedIedRef } },
			expectedQueries: ['/default:SCL[count(*)=0]'],
		},
		'real IED whose only connection holds no address -> IED_NOT_CONNECTED, nothing written': {
			sourceXml: RealIedConnectionWithoutAddressXml,
			targetXml: emptyTarget,
			expectedRefusal: { key: 'IED_NOT_CONNECTED', meta: { ied: selectedIedRef } },
			expectedQueries: ['/default:SCL[count(*)=0]'],
		},
		'no interacting IEDs mode given -> OPTION_NOT_AVAILABLE, nothing written': {
			sourceXml: RealIedConnectedXml,
			targetXml: emptyTarget,
			options: { interactingIeds: undefined },
			expectedRefusal: {
				key: 'OPTION_NOT_AVAILABLE',
				meta: { option: 'interactingIeds', value: 'undefined' },
			},
			expectedQueries: ['/default:SCL[count(*)=0]'],
		},
		'interacting IEDs mode not offered -> OPTION_NOT_AVAILABLE, nothing written': {
			sourceXml: RealIedConnectedXml,
			targetXml: emptyTarget,
			options: { interactingIeds: 'whole' },
			expectedRefusal: {
				key: 'OPTION_NOT_AVAILABLE',
				meta: { option: 'interactingIeds', value: 'whole' },
			},
			expectedQueries: ['/default:SCL[count(*)=0]'],
		},
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
		'client references mode not offered -> OPTION_NOT_AVAILABLE, nothing written': {
			sourceXml: RealIedConnectedXml,
			targetXml: emptyTarget,
			options: { clientRefs: 'clean' },
			expectedRefusal: {
				key: 'OPTION_NOT_AVAILABLE',
				meta: { option: 'clientRefs', value: 'clean' },
			},
			expectedQueries: ['/default:SCL[count(*)=0]'],
		},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const refused = await target
			.transaction(async function exportCid(tx) {
				return tx.lifecycle.extract.ied({
					...CID,
					...(testCase.options as Partial<CidExtractParams>),
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
