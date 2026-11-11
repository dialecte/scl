import { startFile } from './start-file'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { StartFileParams } from './start-file.types'
import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseXmlTestCase & { params: StartFileParams }

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const NEW_FILE: StartFileParams = {
	as: 'new',
	filename: 'FSD_Prot',
	header: { fileType: 'FSD', tool: 'my-tool' },
	item: { who: 'user', what: 'FSD initialization', why: 'extracted' },
}

const NEW_ISD: StartFileParams = {
	as: 'new',
	filename: 'ISD_New Target.scl',
	header: { fileType: 'ISD', tool: 'CURRENT_TOOL', nameStructure: 'IEDName' },
	item: { who: 'current-user', what: 'New initialization', why: 'New extraction' },
}

describe('startFile', () => {
	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function start(tx) {
			await startFile(tx, testCase.params)
		})
		return { assertOn: 'source' }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a new file: a Header of its own uuid, version 0, revision 1, and its first history item': {
			sourceXml: /* xml */ `<SCL ${ns} ${id}="scl-1"></SCL>`,
			params: NEW_FILE,
			expectedQueries: [
				'//default:Header[@id="fsd_prot"][@fileType="FSD"][@toolID="my-tool"][@uuid][@version="0"][@revision="1"]/default:History/default:Hitem[@version="0"][@revision="1"][@what="FSD initialization"]',
			],
		},
		'a document holding a history already: a fresh Header and initialization, not the next revision':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="scl-1">
						<Header id="kept" toolID="T" fileType="FSD" version="1" revision="2" uuid="40000000-0000-4000-8000-000000000001" ${id}="header-1">
							<History ${id}="history-1">
								<Hitem version="1" revision="2" when="now" who="u" what="w" why="y" ${id}="hitem-1"/>
							</History>
						</Header>
					</SCL>
				`,
				params: NEW_FILE,
				expectedQueries: [
					'/default:SCL[count(default:Header)=1]/default:Header[@uuid!="40000000-0000-4000-8000-000000000001"][@id="fsd_prot"][@fileType="FSD"][@toolID="my-tool"][@version="0"][@revision="1"]/default:History[count(default:Hitem)=1]/default:Hitem[@version="0"][@revision="1"][@what="FSD initialization"][not(contains(., "Historical context"))]',
				],
			},
		'a previous Header whose history items hold text → a fresh Header, one initialization item carrying that text as historical context':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="target-root">
						<Header id="prior_target" toolID="OLD_TOOL" fileType="SCD" version="7" revision="9" uuid="40000000-0000-4000-8000-000000000001" baseUuid="40000000-0000-4000-8000-000000000002">
							<Text>Old identity description</Text>
							<History>
								<Hitem version="6" revision="3" when="2024-01-02T03:04:05Z" who="old-user-a" what="old-event-a" why="old-reason-a">First target history text.</Hitem>
								<Hitem version="7" revision="9" when="2025-02-03T04:05:06Z" who="old-user-b" what="old-event-b" why="old-reason-b">Second target history text.</Hitem>
							</History>
						</Header>
					</SCL>
				`,
				params: NEW_ISD,
				expectedQueries: [
					'/default:SCL[count(default:Header)=1]/default:Header[@uuid!="40000000-0000-4000-8000-000000000001"][@id="isd_new_target"][@fileType="ISD"][@toolID="CURRENT_TOOL"][@nameStructure="IEDName"][@version="0"][@revision="1"][not(@baseUuid)][not(default:Text)]/default:History[count(default:Hitem)=1]/default:Hitem[@version="0"][@revision="1"][@who="current-user"][@what="New initialization"][@why="New extraction"][string-length(@when)>0][starts-with(normalize-space(.), "Historical context:")][contains(substring-before(., "Second target history text."), "First target history text.")]',
				],
			},
		'a previous Header without History → a fresh Header without its attributes or text': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="target-root">
					<Header id="prior_target" toolID="OLD_TOOL" fileType="SCD" version="7" revision="9" uuid="40000000-0000-4000-8000-000000000001" baseUuid="40000000-0000-4000-8000-000000000002">
						<Text>Old identity description</Text>
						<!-- no History -->
					</Header>
				</SCL>
			`,
			params: {
				...NEW_ISD,
				filename: 'SSD_New Target.scl',
				header: { ...NEW_ISD.header, fileType: 'SSD' },
			},
			expectedQueries: [
				'/default:SCL[count(default:Header)=1]/default:Header[@uuid!="40000000-0000-4000-8000-000000000001"][@id="ssd_new_target"][@fileType="SSD"][@toolID="CURRENT_TOOL"][@nameStructure="IEDName"][@version="0"][@revision="1"][not(@baseUuid)][not(default:Text)]/default:History[count(default:Hitem)=1]/default:Hitem[@version="0"][@revision="1"][@who="current-user"][@what="New initialization"][@why="New extraction"][not(contains(., "Historical context"))]',
			],
		},
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('startFile refuses a new revision', () => {
	async function act({ source }: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<void> {
		const before = await source.query.getSnapshot({ as: 'tree', unwrap: [] })
		const info = await source.query.getDocumentInfo()
		const infoBefore = structuredClone(info)
		const outcome = await source.transaction(async function startRevision(tx) {
			const stagedBefore = [...tx.getStagedOperations()]
			const refused = await startFile(tx, { ...NEW_FILE, as: 'revision' }).then(
				() => undefined,
				(error: unknown) => error,
			)
			return { refused, stagedBefore, stagedAfter: [...tx.getStagedOperations()] }
		})
		const refusal = toDialecteError(outcome.refused)
		expect({ key: refusal?.key, meta: refusal?.meta }).toEqual({
			key: 'OPTION_NOT_AVAILABLE',
			meta: { option: 'as', value: 'revision' },
		})
		expect(outcome.stagedAfter).toEqual(outcome.stagedBefore)
		const after = await source.query.getSnapshot({ as: 'tree', unwrap: [] })
		const infoAfter = await source.query.getDocumentInfo()
		expect(after).toEqual(before)
		expect(infoAfter).toEqual(infoBefore)
	}

	const testCases: SclTest.TestCases = {
		'a document holding a Header, a new revision asked → refused, nothing staged, document unchanged':
			{
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="target-root">
					<Header id="prior_target" toolID="OLD_TOOL" fileType="FSD" version="7" revision="9" uuid="40000000-0000-4000-8000-000000000001">
						<History>
							<Hitem version="7" revision="9" when="2025-02-03T04:05:06Z" who="old-user-b" what="old-event-b" why="old-reason-b">Second target history text.</Hitem>
						</History>
					</Header>
				</SCL>
			`,
			},
	}

	runSclTestCases.withoutExport({ testCases, act })
})
