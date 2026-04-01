import { getSortedHitems } from './get-sorted-hitem'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseTestCase & {
	expectedOrder: { version: string; revision: string }[]
}

describe('getSortedHitems', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'no History element → empty array': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
			</SCL>
		`,
			expectedOrder: [],
		},

		'one Hitem → returned as single-element array': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Header id="h" toolID="T" fileType="SCD" version="1" revision="1" uuid="u1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="header-1">
					<History ${CUSTOM_RECORD_ID_ATTRIBUTE}="history-1">
						<Hitem version="1" revision="1" when="now" who="u" what="w" why="y" ${CUSTOM_RECORD_ID_ATTRIBUTE}="hitem-1"/>
					</History>
				</Header>
			</SCL>
		`,
			expectedOrder: [{ version: '1', revision: '1' }],
		},

		'Hitems out of order by version → sorted by version ascending': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Header id="h" toolID="T" fileType="SCD" version="2" revision="1" uuid="u1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="header-1">
					<History ${CUSTOM_RECORD_ID_ATTRIBUTE}="history-1">
						<Hitem version="2" revision="1" when="now" who="u" what="w" why="y" ${CUSTOM_RECORD_ID_ATTRIBUTE}="hitem-1"/>
						<Hitem version="1" revision="1" when="now" who="u" what="w" why="y" ${CUSTOM_RECORD_ID_ATTRIBUTE}="hitem-2"/>
					</History>
				</Header>
			</SCL>
		`,
			expectedOrder: [
				{ version: '1', revision: '1' },
				{ version: '2', revision: '1' },
			],
		},

		'Hitems same version, different revision → sorted by revision ascending': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Header id="h" toolID="T" fileType="SCD" version="1" revision="3" uuid="u1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="header-1">
					<History ${CUSTOM_RECORD_ID_ATTRIBUTE}="history-1">
						<Hitem version="1" revision="3" when="now" who="u" what="w" why="y" ${CUSTOM_RECORD_ID_ATTRIBUTE}="hitem-3"/>
						<Hitem version="1" revision="1" when="now" who="u" what="w" why="y" ${CUSTOM_RECORD_ID_ATTRIBUTE}="hitem-1"/>
						<Hitem version="1" revision="2" when="now" who="u" what="w" why="y" ${CUSTOM_RECORD_ID_ATTRIBUTE}="hitem-2"/>
					</History>
				</Header>
			</SCL>
		`,
			expectedOrder: [
				{ version: '1', revision: '1' },
				{ version: '1', revision: '2' },
				{ version: '1', revision: '3' },
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const sorted = await getSortedHitems(source.document.query)
		const result = sorted.map((h) => ({
			version: h.attributes.find((a) => a.name === 'version')?.value ?? '',
			revision: h.attributes.find((a) => a.name === 'revision')?.value ?? '',
		}))
		expect(result).toEqual(testCase.expectedOrder)
		return { assertDatabaseName: source.databaseName }
	}

	runSclTestCases({ testCases, act })
})
