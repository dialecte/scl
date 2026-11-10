import { startFile } from './start-file'

import { toDialecteError } from '@dialecte/core'
import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test'

import type { StartFileParams } from './start-file.types'
import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseXmlTestCase & { params: StartFileParams }

const emptyXml = `<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1"></SCL>`

const NEW_FILE: StartFileParams = {
	as: 'new',
	filename: 'FSD_Prot',
	header: { fileType: 'FSD', tool: 'my-tool' },
	item: { who: 'user', what: 'FSD initialization', why: 'extracted' },
}

describe('startFile', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a new file: a Header of its own uuid, version 0, revision 1, and its first history item': {
			sourceXml: emptyXml,
			params: NEW_FILE,
			expectedQueries: [
				'//default:Header[@id="fsd_prot"][@fileType="FSD"][@toolID="my-tool"][@uuid][@version="0"][@revision="1"]/default:History/default:Hitem[@version="0"][@revision="1"][@what="FSD initialization"]',
			],
		},
	}

	const documentWithHistoryCases: SclTest.TestCases<TestCase> = {
		'a document holding a history already: a fresh Header and initialization, not the next revision':
			{
				sourceXml: `
				<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
					<Header id="kept" toolID="T" fileType="FSD" version="1" revision="2" uuid="40000000-0000-4000-8000-000000000001" ${CUSTOM_RECORD_ID_ATTRIBUTE}="header-1">
						<History ${CUSTOM_RECORD_ID_ATTRIBUTE}="history-1">
							<Hitem version="1" revision="2" when="now" who="u" what="w" why="y" ${CUSTOM_RECORD_ID_ATTRIBUTE}="hitem-1"/>
						</History>
					</Header>
				</SCL>
			`,
				params: NEW_FILE,
				expectedQueries: [
					'/default:SCL[count(default:Header)=1]/default:Header[@uuid!="40000000-0000-4000-8000-000000000001"][@id="fsd_prot"][@fileType="FSD"][@toolID="my-tool"][@version="0"][@revision="1"]/default:History[count(default:Hitem)=1]/default:Hitem[@version="0"][@revision="1"][@what="FSD initialization"]',
				],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function start(tx) {
			await startFile(tx, testCase.params)
		})
		return { assertOn: 'source' }
	}

	async function startAndReadFreshHeader(
		params: SclTest.ActParams<TestCase>,
	): Promise<SclTest.ActResult> {
		const result = await act(params)
		const { source } = params
		const header = await source.query.getRecord({ tagName: 'Header' })
		expect(header).toBeDefined()
		const attributes = await source.query.getAttributes(header!)
		expect(attributes).toMatchObject({
			id: 'fsd_prot',
			toolID: 'my-tool',
			fileType: 'FSD',
			version: '0',
			revision: '1',
		})
		return result
	}

	runSclTestCases.withExport({ testCases, act })
	runSclTestCases.withExport({
		testCases: documentWithHistoryCases,
		act: startAndReadFreshHeader,
	})

	it('a new revision of an existing file is refused as not available yet', async () => {
		const { source } = await createSclTestProject({ sourceXml: emptyXml })
		const refused = source.document.transaction(async function start(tx) {
			await startFile(tx, { ...NEW_FILE, as: 'revision' })
		})
		await expect(refused).rejects.toThrow()
		const caught = await refused.catch((error: unknown) => error)
		const refusal = toDialecteError(caught)
		expect({ key: refusal?.key, meta: refusal?.meta }).toEqual({
			key: 'OPTION_NOT_AVAILABLE',
			meta: { option: 'as', value: 'revision' },
		})
	})
})
