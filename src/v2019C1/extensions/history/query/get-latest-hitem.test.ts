import { getLatestHitem } from './get-latest-hitem'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseTestCase & {
	expectedLatest: { version: string; revision: string } | null
}

describe('getLatestHitem', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'no History element → undefined': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
			</SCL>
		`,
			expectedLatest: null,
		},

		'one Hitem → that Hitem returned': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Header id="h" toolID="T" fileType="SCD" version="1" revision="1" uuid="u1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="header-1">
					<History ${CUSTOM_RECORD_ID_ATTRIBUTE}="history-1">
						<Hitem version="1" revision="1" when="now" who="u" what="w" why="y" ${CUSTOM_RECORD_ID_ATTRIBUTE}="hitem-1"/>
					</History>
				</Header>
			</SCL>
		`,
			expectedLatest: { version: '1', revision: '1' },
		},

		'multiple Hitems with different versions → highest version returned': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Header id="h" toolID="T" fileType="SCD" version="3" revision="1" uuid="u1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="header-1">
					<History ${CUSTOM_RECORD_ID_ATTRIBUTE}="history-1">
						<Hitem version="1" revision="1" when="now" who="u" what="w" why="y" ${CUSTOM_RECORD_ID_ATTRIBUTE}="hitem-1"/>
						<Hitem version="3" revision="1" when="now" who="u" what="w" why="y" ${CUSTOM_RECORD_ID_ATTRIBUTE}="hitem-3"/>
						<Hitem version="2" revision="1" when="now" who="u" what="w" why="y" ${CUSTOM_RECORD_ID_ATTRIBUTE}="hitem-2"/>
					</History>
				</Header>
			</SCL>
		`,
			expectedLatest: { version: '3', revision: '1' },
		},

		'multiple Hitems, same version, different revision → highest revision returned': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Header id="h" toolID="T" fileType="SCD" version="1" revision="3" uuid="u1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="header-1">
					<History ${CUSTOM_RECORD_ID_ATTRIBUTE}="history-1">
						<Hitem version="1" revision="1" when="now" who="u" what="w" why="y" ${CUSTOM_RECORD_ID_ATTRIBUTE}="hitem-1"/>
						<Hitem version="1" revision="3" when="now" who="u" what="w" why="y" ${CUSTOM_RECORD_ID_ATTRIBUTE}="hitem-3"/>
						<Hitem version="1" revision="2" when="now" who="u" what="w" why="y" ${CUSTOM_RECORD_ID_ATTRIBUTE}="hitem-2"/>
					</History>
				</Header>
			</SCL>
		`,
			expectedLatest: { version: '1', revision: '3' },
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const latest = await getLatestHitem(source.document.query)
		if (testCase.expectedLatest === null) {
			expect(latest).toBeUndefined()
		} else {
			expect(latest?.attributes.find((a) => a.name === 'version')?.value).toBe(
				testCase.expectedLatest.version,
			)
			expect(latest?.attributes.find((a) => a.name === 'revision')?.value).toBe(
				testCase.expectedLatest.revision,
			)
		}
		return { assertDatabaseName: source.databaseName }
	}

	runSclTestCases({ testCases, act })
})
