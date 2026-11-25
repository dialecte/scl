import { getProvenance } from './get-provenance'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** The store reads of the ancestor walks and the records they move, counted by the dev perf counters. */
const MANY_READ = 'core::store::getMany'
const MANY_MOVED = 'core::store::records.getMany'

// One source-file reference under a Function, an Application, the Header and an IED.
const FOUR_ANCHORS_XML = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Header ${id}="header" id="doc" version="1" revision="0" uuid="doc-uuid">
			<SourceFiles ${id}="srcfiles">
				<SclFileReference ${id}="sfr-d" fileType="SSD" fileUuid="ssd-uuid" version="5" revision="2"/>
			</SourceFiles>
		</Header>
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
		<IED ${id}="ied" name="TargetIED">
			<AccessPoint ${id}="ap" name="AP1"/>
			<IEDSourceFiles ${id}="iedsrcfiles">
				<SclFileReference ${id}="sfr-i" fileType="ISD" fileUuid="isd-uuid" version="2" revision="B"/>
			</IEDSourceFiles>
		</IED>
	</SCL>
`

// The anchors of all references come from one ancestor walk: one read per level holding an ancestor not read yet,
// each ancestor read once, however many references share it.
describe('getProvenance - the anchors read in one walk', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		expected: { reads: number; moved: number; anchors: string[] }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// level 1: the 4 reference parents; 2: the Function's Private, the Application, the Header, the IED;
		// 3: the Function, the Substation's Private, the SCL; 4: the Bay, the Substation; 5: the VoltageLevel
		'4 references under 4 anchors → 5 reads, 14 records, the anchors in the order the references are read':
			{
				sourceXml: FOUR_ANCHORS_XML,
				expected: { reads: 5, moved: 14, anchors: ['app', 'header', 'func', 'ied'] },
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			source.perf.reset()
			const entries = await getProvenance(source.query)
			const report = source.perf.report()
			const anchors = entries.map(function anchorIdOf(entry) {
				return entry.anchor.ref.id
			})
			expect({
				reads: report[MANY_READ]?.count ?? 0,
				moved: report[MANY_MOVED]?.count ?? 0,
				anchors,
			}).toEqual(testCase.expected)
		},
	})
})
