import { getProvenance } from './get-provenance'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { ProvenanceAnchorKind } from './get-provenance.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type ExpectedEntry = {
	fileType: string
	fileName?: string
	fileUuid?: string
	version: string
	revision: string
	anchorKind: ProvenanceAnchorKind
	anchorId: string
}

type TestCase = SclTest.BaseXmlTestCase & {
	expected: ExpectedEntry[]
}

describe('getProvenance', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'no SclFileReference → empty': {
			sourceXml: /* xml */ `<SCL ${ns} ${id}="root" version="2007" revision="C" release="5"/>`,
			expected: [],
		},

		'FunctionSclRef under a Function → function anchor': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
					<Substation ${id}="sub" name="TEMPLATE">
						<VoltageLevel ${id}="vl" name="TEMPLATE">
							<Bay ${id}="bay" name="TEMPLATE">
								<Function ${id}="func" name="HMI Function" uuid="func-uuid">
									<Private ${id}="func-priv" type="eIEC61850-6-100">
										<eIEC61850-6-100:FunctionSclRef ${id}="fsclref">
											<eIEC61850-6-100:SclFileReference ${id}="sfr-f" fileType="FSD" fileUuid="fsd-uuid" version="2" revision="1"/>
										</eIEC61850-6-100:FunctionSclRef>
									</Private>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expected: [
				{
					fileType: 'FSD',
					fileUuid: 'fsd-uuid',
					version: '2',
					revision: '1',
					anchorKind: 'function',
					anchorId: 'func',
				},
			],
		},

		'ApplicationSclRef under an Application → application anchor': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
					<Substation ${id}="sub" name="TEMPLATE">
						<Private ${id}="sub-priv" type="eIEC61850-6-100">
							<eIEC61850-6-100:Application ${id}="app" name="HMI_App" uuid="app-uuid">
								<eIEC61850-6-100:ApplicationSclRef ${id}="asclref">
									<eIEC61850-6-100:SclFileReference ${id}="sfr-a" fileType="ASD" fileUuid="asd-uuid" version="3" revision="0"/>
								</eIEC61850-6-100:ApplicationSclRef>
							</eIEC61850-6-100:Application>
						</Private>
					</Substation>
				</SCL>
			`,
			expected: [
				{
					fileType: 'ASD',
					fileUuid: 'asd-uuid',
					version: '3',
					revision: '0',
					anchorKind: 'application',
					anchorId: 'app',
				},
			],
		},

		'SourceFiles under Header → document anchor': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
					<Header ${id}="header" id="doc" version="1" revision="0" uuid="doc-uuid">
						<SourceFiles ${id}="srcfiles">
							<SclFileReference ${id}="sfr-d" fileType="SSD" fileUuid="ssd-uuid" version="5" revision="2"/>
						</SourceFiles>
					</Header>
				</SCL>
			`,
			expected: [
				{
					fileType: 'SSD',
					fileUuid: 'ssd-uuid',
					version: '5',
					revision: '2',
					anchorKind: 'document',
					anchorId: 'header',
				},
			],
		},

		'IEDSourceFiles under an IED → ied anchor, that IED': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
					<IED ${id}="other-ied" name="OtherIED">
						<AccessPoint ${id}="other-access-point" name="AP1"/>
						<!-- no IEDSourceFiles -->
					</IED>
					<IED ${id}="target-ied" name="TargetIED">
						<AccessPoint ${id}="target-access-point" name="AP1"/>
						<IEDSourceFiles ${id}="iedsrcfiles">
							<SclFileReference ${id}="sfr-i" fileType="ISD" fileName="source.xml" fileUuid="isd-uuid" version="2" revision="B"/>
						</IEDSourceFiles>
					</IED>
				</SCL>
			`,
			expected: [
				{
					fileType: 'ISD',
					fileName: 'source.xml',
					fileUuid: 'isd-uuid',
					version: '2',
					revision: 'B',
					anchorKind: 'ied',
					anchorId: 'target-ied',
				},
			],
		},

		'multiple references → one entry each': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
					<Substation ${id}="sub" name="TEMPLATE">
						<VoltageLevel ${id}="vl" name="TEMPLATE">
							<Bay ${id}="bay" name="TEMPLATE">
								<Function ${id}="func" name="HMI Function" uuid="func-uuid">
									<Private ${id}="func-priv" type="eIEC61850-6-100">
										<eIEC61850-6-100:FunctionSclRef ${id}="fsclref">
											<eIEC61850-6-100:SclFileReference ${id}="sfr-f" fileType="FSD" fileUuid="fsd-uuid" version="2" revision="1"/>
										</eIEC61850-6-100:FunctionSclRef>
									</Private>
								</Function>
							</Bay>
						</VoltageLevel>
						<Private ${id}="sub-priv" type="eIEC61850-6-100">
							<eIEC61850-6-100:Application ${id}="app" name="HMI_App" uuid="app-uuid">
								<eIEC61850-6-100:ApplicationSclRef ${id}="asclref">
									<eIEC61850-6-100:SclFileReference ${id}="sfr-a" fileType="ASD" fileUuid="asd-uuid" version="3" revision="0"/>
								</eIEC61850-6-100:ApplicationSclRef>
							</eIEC61850-6-100:Application>
						</Private>
					</Substation>
				</SCL>
			`,
			expected: [
				{
					fileType: 'FSD',
					fileUuid: 'fsd-uuid',
					version: '2',
					revision: '1',
					anchorKind: 'function',
					anchorId: 'func',
				},
				{
					fileType: 'ASD',
					fileUuid: 'asd-uuid',
					version: '3',
					revision: '0',
					anchorKind: 'application',
					anchorId: 'app',
				},
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const entries = await getProvenance(source.query)
		const actual = entries.map((entry) => ({
			fileType: entry.fileType,
			fileName: entry.fileName,
			fileUuid: entry.fileUuid,
			version: entry.version,
			revision: entry.revision,
			anchorKind: entry.anchor.kind,
			anchorId: entry.anchor.ref.id,
		}))
		expect(sortEntries(actual)).toEqual(sortEntries(testCase.expected))
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

function sortEntries<GenericEntry extends { anchorId: string | undefined; fileType: string }>(
	entries: GenericEntry[],
): GenericEntry[] {
	return [...entries].sort((left, right) =>
		`${left.anchorId}:${left.fileType}`.localeCompare(`${right.anchorId}:${right.fileType}`),
	)
}
