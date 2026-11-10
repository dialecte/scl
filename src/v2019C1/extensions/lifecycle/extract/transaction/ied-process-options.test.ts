/// <reference types="vite/client" />

import ApplicationNamingF1AndAVariableOfF3Xml from './fixtures/application-naming-f1-and-a-variable-of-f3.xml?raw'
import ApplicationsRolesAndRelationsNamingF1AndF3Xml from './fixtures/applications-roles-and-relations-naming-f1-and-f3.xml?raw'
import LabelInAVendorPrivateOfF1Xml from './fixtures/label-in-a-vendor-private-of-f1.xml?raw'
import LabelsOnF1ItsLnodeIedAAndATypeXml from './fixtures/labels-on-f1-its-lnode-ied-a-and-a-type.xml?raw'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { IedExtractParams } from './ied.types'
import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseXmlTestCase & {
	options?: Pick<
		IedExtractParams,
		'labels' | 'applications' | 'allocationRoles' | 'powerSystemRelations'
	>
}

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
	testCase,
}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
	if (!target) throw new Error('target required')
	await target.transaction(async function exportIsd(tx) {
		return tx.lifecycle.extract.ied({ ...EXPORT, sourceQuery: source.query, ...testCase.options })
	})
	return { assertOn: 'target' }
}

describe('labels are written unless the export leaves them out', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'labels on F1, its LNode, IED A and a data type, labels off → no label anywhere in the file': {
			sourceXml: LabelsOnF1ItsLnodeIedAAndATypeXml,
			targetXml: emptyIsd,
			options: { labels: false },
			expectedQueries: ['//default:Function[@name="F1"]/default:LNode[@iedName="A"]'],
			unexpectedQueries: ['//default:Labels', '//default:Label'],
		},
		'the same labels, labels option left at its default → each one written': {
			sourceXml: LabelsOnF1ItsLnodeIedAAndATypeXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'//default:Function[@name="F1"]/default:Labels/default:Label[@id="F1"][@lang="en"][text()="Line protection"]',
				'//default:Function[@name="F1"]/default:LNode/default:Labels/default:Label[@id="Trip"][text()="Trip"]',
				'//default:IED[@name="A"]/default:Labels/default:Label[@id="A"][text()="Bay controller"]',
				'//default:LNodeType[@id="LN_T"]/default:DO[@name="Op"]/default:Labels/default:Label[@id="Op"][text()="Operate"]',
			],
		},
		'a label inside a vendor Private of F1, labels off → that vendor content kept as it is': {
			sourceXml: LabelInAVendorPrivateOfF1Xml,
			targetXml: emptyIsd,
			options: { labels: false },
			expectedQueries: [
				'//default:Function[@name="F1"]/default:Private[@type="vendor.payload"]/default:Labels/default:Label[text()="Vendor text"]',
			],
		},
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('applications, allocation roles and power system relations travel with the functions they name, unless left out', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'application naming F1 and F3 of B, options left at their default → written naming F1 only': {
			sourceXml: ApplicationsRolesAndRelationsNamingF1AndF3Xml,
			targetXml: emptyIsd,
			expectedQueries: [
				'//default:Bay[@name="B1"]/default:Private/v2019C1:Application[@name="Protection"][@uuid="16000000-0000-4000-8000-000000000001"][count(.//v2019C1:FunctionRef)=1]//v2019C1:FunctionRef[@functionUuid="12000000-0000-4000-8000-000000000001"]',
			],
		},
		'application naming F3 of B only, options left at their default → not written': {
			sourceXml: ApplicationsRolesAndRelationsNamingF1AndF3Xml,
			targetXml: emptyIsd,
			expectedQueries: ['//v2019C1:Application[@name="Protection"]'],
			unexpectedQueries: ['//v2019C1:Application[@name="Remote"]'],
		},
		'allocation role naming F1 and F3 of B, options left at their default → written naming F1 only':
			{
				sourceXml: ApplicationsRolesAndRelationsNamingF1AndF3Xml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:Bay[@name="B1"]/default:Private/v2019C1:AllocationRole[@name="BayController"][count(v2019C1:FunctionRef)=1]/v2019C1:FunctionRef[@functionUuid="12000000-0000-4000-8000-000000000001"]',
				],
			},
		'relations of F1 to breaker QA1 the file holds and to QA2 it does not, options left at their default → the relation to QA1 only':
			{
				sourceXml: ApplicationsRolesAndRelationsNamingF1AndF3Xml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:Function[@name="F1"]/default:Private/v2019C1:PowerSystemRelations[count(v2019C1:PowerSystemRelation)=1]/v2019C1:PowerSystemRelation[@name="Trips"][@relationUuid="11000000-0000-4000-8000-000000000005"]',
				],
				unexpectedQueries: ['//default:ConductingEquipment[@name="QA2"]'],
			},
		'application, allocation role and relations, the three options off → none of them in the file':
			{
				sourceXml: ApplicationsRolesAndRelationsNamingF1AndF3Xml,
				targetXml: emptyIsd,
				options: { applications: false, allocationRoles: false, powerSystemRelations: false },
				expectedQueries: [
					'//default:Bay[@name="B1"]/default:Function[@name="F1"]/default:LNode[@iedName="A"]',
					'//default:ConductingEquipment[@name="QA1"]/default:EqFunction/default:LNode[@iedName="A"]',
				],
				unexpectedQueries: [
					'//v2019C1:Application',
					'//v2019C1:AllocationRole',
					'//v2019C1:PowerSystemRelations',
				],
			},
		'application naming F1 and a variable of F1 that applies to F3 of B only → written without its reference to the variable':
			{
				sourceXml: ApplicationNamingF1AndAVariableOfF3Xml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//v2019C1:Application[@name="Protection"]//v2019C1:FunctionRef[@functionUuid="12000000-0000-4000-8000-000000000001"]',
				],
				unexpectedQueries: ['//v2019C1:Variable', '//v2019C1:VariableRef'],
			},
	}

	runSclTestCases.withExport({ testCases, act })
})
