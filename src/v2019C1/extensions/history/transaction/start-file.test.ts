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
		'a document holding a history already: its Header and version kept, the next revision': {
			sourceXml: `
				<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
					<Header id="kept" toolID="T" fileType="FSD" version="1" revision="2" uuid="kept-uuid" ${CUSTOM_RECORD_ID_ATTRIBUTE}="header-1">
						<History ${CUSTOM_RECORD_ID_ATTRIBUTE}="history-1">
							<Hitem version="1" revision="2" when="now" who="u" what="w" why="y" ${CUSTOM_RECORD_ID_ATTRIBUTE}="hitem-1"/>
						</History>
					</Header>
				</SCL>
			`,
			params: NEW_FILE,
			expectedQueries: [
				'//default:Header[@uuid="kept-uuid"][@version="1"][@revision="3"]/default:History/default:Hitem[@version="1"][@revision="3"]',
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

	runSclTestCases.withExport({ testCases, act })

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
