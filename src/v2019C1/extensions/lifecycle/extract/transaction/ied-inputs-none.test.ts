/// <reference types="vite/client" />

import SelectedIedWithASelfInputOnLn0Xml from './fixtures/selected-ied-with-a-self-input-on-ln0.xml?raw'
import SelectedIedWithAnInputOnLnFedByPublisherXml from './fixtures/selected-ied-with-an-input-on-ln-fed-by-publisher.xml?raw'
import SelectedIedWithInputsAcrossTwoAccessPointsXml from './fixtures/selected-ied-with-inputs-across-two-access-points.xml?raw'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

const emptyTarget = /* xml */ `<SCL ${ns} ${id}="empty-target"/>`
const retainedQueries = [
	'/default:SCL[count(default:IED)=1]/default:IED[@name="Selected"][@uuid="20000000-0000-4000-8000-000000000001"]',
	'//default:IED[@name="Selected"]/default:AccessPoint[@name="AP1"]/default:Server/default:LDevice[@inst="LD1"][count(default:LN0)=1][count(default:LN)=1]/default:LN0[@lnClass="LLN0"][@uuid="50000000-0000-4000-8000-000000000001"][@lnType="LLN0_Type"]',
	'//default:LDevice[@inst="LD1"]/default:LN[@lnClass="PTOC"][@inst="1"][@uuid="50000000-0000-4000-8000-000000000002"][@lnType="PTOC_Type"]/default:DOI[@name="Status"]/default:DAI[@name="stVal"]/default:Val[text()="true"]',
	'//default:IED[@name="Selected"]/default:Private[@type="vendor.outside"]/*[local-name()="Settings"][namespace-uri()="urn:ied-inputs:test"][@mode="retained"][text()="outside payload"]',
]
const absentQueries = [
	'//default:Inputs',
	'//default:ExtRef',
	'//default:IED[@name="Publisher"]',
	'//default:Private[@type="vendor.inside"]',
]

describe('extract IED with inputs none', () => {
	const testCases: Record<string, TestCase> = {
		'LN0 self input -> whole wrapper omitted with parent and sibling retained': {
			sourceXml: SelectedIedWithASelfInputOnLn0Xml,
			targetXml: emptyTarget,
			expectedQueries: [
				...retainedQueries,
				'//default:IED[@name="Selected"][count(default:AccessPoint)=1]',
			],
			unexpectedQueries: absentQueries,
		},
		'Ordinary LN external input -> wrapper omitted without dependency warning': {
			sourceXml: SelectedIedWithAnInputOnLnFedByPublisherXml,
			targetXml: emptyTarget,
			expectedQueries: [
				...retainedQueries,
				'//default:IED[@name="Selected"][count(default:AccessPoint)=1]',
			],
			unexpectedQueries: absentQueries,
		},
		'Inputs across two access points -> all wrappers omitted with unrelated vendor content retained':
			{
				sourceXml: SelectedIedWithInputsAcrossTwoAccessPointsXml,
				targetXml: emptyTarget,
				expectedQueries: [
					...retainedQueries,
					'//default:IED[@name="Selected"][count(default:AccessPoint)=2]/default:AccessPoint[@name="AP2"][@uuid="30000000-0000-4000-8000-000000000002"]/default:Server/default:LDevice[@inst="LD2"][count(default:LN0)=1][count(default:LN)=1]/default:LN0[@lnClass="LLN0"][@uuid="50000000-0000-4000-8000-000000000004"]',
					'//default:LDevice[@inst="LD2"]/default:LN[@lnClass="PTOC"][@inst="2"][@uuid="50000000-0000-4000-8000-000000000005"][@lnType="PTOC_Type"]',
				],
				unexpectedQueries: [...absentQueries, '//default:Text[text()="input-only text"]'],
			},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const result = await target.transaction(async function extract(tx) {
			return tx.lifecycle.extract.ied({
				sourceQuery: source.query,
				iedRef: { tagName: 'IED', id: 'selected-ied' },
				fileType: 'ISD',
				kind: 'instance',
				inputs: 'none',
				issuer: 'TEST_ISSUER',
				tool: 'TEST',
				who: 'test',
			})
		})
		expect(result).toEqual({ warnings: [] })
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
