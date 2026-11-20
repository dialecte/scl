/// <reference types="vite/client" />

import CategoriesAtTheBayAndTheSubstationNamingF1Xml from './fixtures/categories-at-the-bay-and-the-substation-naming-f1.xml?raw'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const emptyIsd = /* xml */ `<SCL ${ns} ${id}="empty-isd"/>`

const EXPORT = {
	iedRef: { tagName: 'IED', id: 'ied-a' },
	fileType: 'ISD',
	kind: 'instance',
	inputs: 'none',
	issuer: 'TEST_ISSUER',
	tool: 'TEST',
	who: 'engineer',
} as const

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

describe('an exported ISD holds no function category: they classify the functions of the project', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// S1 holds a category (with a subcategory) and B1 another, each alone in its Private, both naming F1 of A
		'categories at the bay and at the substation naming F1 of A → none in the file, F1 written, no empty Private left':
			{
				sourceXml: CategoriesAtTheBayAndTheSubstationNamingF1Xml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:Substation[@name="S1"]/default:VoltageLevel[@name="V1"]/default:Bay[@name="B1"]/default:Function[@name="F1"]/default:LNode[@iedName="A"]',
				],
				unexpectedQueries: [
					'//v2019C1:FunctionCategory',
					'//v2019C1:SubCategory',
					'//v2019C1:FunctionCatRef',
					'//default:Private[@type="eIEC61850-6-100"][not(*)]',
				],
			},
		// the application Protection in B1 names F1 and, beside it, the category of B1
		'an application naming F1 and the bay category → written naming F1, without its reference to the category':
			{
				sourceXml: CategoriesAtTheBayAndTheSubstationNamingF1Xml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:Bay[@name="B1"]/default:Private/v2019C1:Application[@name="Protection"]//v2019C1:FunctionRef[@functionUuid="12000000-0000-4000-8000-000000000001"]',
				],
				unexpectedQueries: ['//v2019C1:FunctionCategoryRef'],
			},
	}

	runSclTestCases.withExport({ testCases, act })
})
