/// <reference types="vite/client" />

import RealIedConnectedXml from '../transaction/fixtures/cid-real-ied-connected.xml?raw'
import RealIedConnectionWithoutAddressXml from '../transaction/fixtures/cid-real-ied-connection-without-address.xml?raw'
import SpecificationIedConnectedXml from '../transaction/fixtures/cid-specification-ied-connected.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { IedExportOption } from './export-options.types'
import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseXmlTestCase & { expected: IedExportOption[] }

const selectedIedRef = { tagName: 'IED', id: 'selected-ied' } as const

describe('query.lifecycle.exportOptions - the files an IED can be exported as', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		// Selected is a real IED whose connection holds an address
		'real IED with an address -> CID and IID offered, ISD refused as for an implemented IED': {
			sourceXml: RealIedConnectedXml,
			expected: [
				{
					fileType: 'ISD',
					offered: false,
					refusal: { key: 'IED_NOT_SPECIFICATION', meta: { ied: selectedIedRef } },
				},
				{ fileType: 'CID', offered: true },
				{ fileType: 'IID', offered: true },
			],
		},
		// Selected is a real IED whose only connection holds no address
		'real IED whose connection holds no address -> CID refused as not connected, IID offered': {
			sourceXml: RealIedConnectionWithoutAddressXml,
			expected: [
				{
					fileType: 'ISD',
					offered: false,
					refusal: { key: 'IED_NOT_SPECIFICATION', meta: { ied: selectedIedRef } },
				},
				{
					fileType: 'CID',
					offered: false,
					refusal: { key: 'IED_NOT_CONNECTED', meta: { ied: selectedIedRef } },
				},
				{ fileType: 'IID', offered: true },
			],
		},
		// Selected is a specification IED
		'specification IED -> ISD offered, CID and IID refused as not a real IED': {
			sourceXml: SpecificationIedConnectedXml,
			expected: [
				{ fileType: 'ISD', offered: true },
				{
					fileType: 'CID',
					offered: false,
					refusal: { key: 'IED_NOT_IMPLEMENTED', meta: { ied: selectedIedRef } },
				},
				{
					fileType: 'IID',
					offered: false,
					refusal: { key: 'IED_NOT_IMPLEMENTED', meta: { ied: selectedIedRef } },
				},
			],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			await expect(
				source.query.lifecycle.exportOptions({ iedRef: selectedIedRef }),
			).resolves.toEqual(testCase.expected)
		},
	})
})
