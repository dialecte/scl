import { addHistoryEntry } from './add-history-entry'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseTestCase & {
	params: {
		filename: string
		header: {
			id?: string
			fileType: Scl.AttributesValueObjectOf<'Header'>['fileType']
			version: 'keep' | 'increment'
			tool: Scl.AttributesValueObjectOf<'Header'>['toolID']
		}
		item: {
			who: Scl.AttributesValueObjectOf<'Hitem'>['who']
			what: Scl.AttributesValueObjectOf<'Hitem'>['what']
			why: Scl.AttributesValueObjectOf<'Hitem'>['why']
		}
	}
}

const BASE_PARAMS: TestCase['params'] = {
	filename: 'project.scd',
	header: { fileType: 'SCD', version: 'keep', tool: 'SET' },
	item: { who: 'user', what: 'change', why: 'reason' },
}

describe('addHistoryEntry', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'empty SCL → Header, History and first Hitem created with version=0, revision=1': {
			sourceXml: `<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1"></SCL>`,
			params: BASE_PARAMS,
			expectedQueries: [
				'//default:Header[@version="0"][@revision="1"]/default:History/default:Hitem[@version="0"][@revision="1"][@who="user"][@what="change"][@why="reason"]',
			],
		},

		'empty SCL, custom header id provided → Header[@id] matches custom id': {
			sourceXml: `<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1"></SCL>`,
			params: { ...BASE_PARAMS, header: { ...BASE_PARAMS.header, id: 'my-custom-id' } },
			expectedQueries: ['//default:Header[@id="my-custom-id"]'],
		},

		'empty SCL, filename with spaces → Header id derived as snake_case': {
			sourceXml: `<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1"></SCL>`,
			params: { ...BASE_PARAMS, filename: 'My Project File.scd' },
			expectedQueries: ['//default:Header[@id="my_project_file"]'],
		},

		'Header exists without History → History and Hitem added under existing Header': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Header id="existing" toolID="T" fileType="SCD" version="0" revision="0" uuid="u1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="header-1"/>
			</SCL>
		`,
			params: BASE_PARAMS,
			expectedQueries: [
				'//default:Header[@id="existing"]/default:History/default:Hitem[@version="0"][@revision="1"]',
			],
			unexpectedQueries: ['//default:Header[@id="project"]'],
		},

		'existing Hitem (version=1, revision=2), version=keep → revision incremented, version preserved':
			{
				sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Header id="h" toolID="T" fileType="SCD" version="1" revision="2" uuid="u1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="header-1">
					<History ${CUSTOM_RECORD_ID_ATTRIBUTE}="history-1">
						<Hitem version="1" revision="2" when="now" who="u" what="w" why="y" ${CUSTOM_RECORD_ID_ATTRIBUTE}="hitem-1"/>
					</History>
				</Header>
			</SCL>
		`,
				params: BASE_PARAMS,
				expectedQueries: ['//default:Hitem[@version="1"][@revision="3"]'],
				unexpectedQueries: ['//default:Hitem[@version="2"]'],
			},

		'existing Hitem (version=1, revision=1), version=increment → version and revision both incremented':
			{
				sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Header id="h" toolID="T" fileType="SCD" version="1" revision="1" uuid="u1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="header-1">
					<History ${CUSTOM_RECORD_ID_ATTRIBUTE}="history-1">
						<Hitem version="1" revision="1" when="now" who="u" what="w" why="y" ${CUSTOM_RECORD_ID_ATTRIBUTE}="hitem-1"/>
					</History>
				</Header>
			</SCL>
		`,
				params: { ...BASE_PARAMS, header: { ...BASE_PARAMS.header, version: 'increment' } },
				expectedQueries: [
					'//default:Header[@version="2"]/default:History/default:Hitem[@version="2"][@revision="2"]',
				],
				unexpectedQueries: ['//default:Hitem[@version="1"][@revision="2"]'],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.document.transaction(async (tx) => {
			await addHistoryEntry(tx, testCase.params)
		})
		return { assertDatabaseName: source.databaseName }
	}

	runSclTestCases({ testCases, act })
})
