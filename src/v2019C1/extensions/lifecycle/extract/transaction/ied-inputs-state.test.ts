/// <reference types="vite/client" />

import InputsOfAFedByAAndByRXml from './fixtures/inputs-of-a-fed-by-a-and-by-r.xml?raw'

import { describe, expect } from 'vitest'

import { of } from '@/v2019C1/extensions/info/query/of'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const EXPORT = {
	iedRef: { tagName: 'IED', id: 'ied-a' },
	fileType: 'ISD',
	kind: 'instance',
	inputs: 'later-binding',
	issuer: 'TEST_ISSUER',
	tool: 'TEST',
	who: 'engineer',
} as const

describe('an input of an exported ISD reads as later-binding', () => {
	async function act({
		source,
		target,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		await target.transaction(async function exportIsd(tx) {
			return tx.lifecycle.extract.ied({ ...EXPORT, sourceQuery: source.query })
		})
		const inputs = await target.query.findByAttributes({
			tagName: 'ExtRef',
			attributes: { intAddr: 'RemoteTrip' },
		})
		expect(inputs).toHaveLength(1)
		const info = await of(target.query, inputs[0], { withState: true })
		expect(info.state).toBe('later-binding')
	}

	const testCases: SclTest.TestCases = {
		'input of PTOC fed by gcbR of R, exported in later-binding form → its state is later-binding': {
			sourceXml: InputsOfAFedByAAndByRXml,
			targetXml: /* xml */ `<SCL ${ns} ${id}="empty-isd"/>`,
		},
	}

	runSclTestCases.withoutExport({ testCases, act })
})
