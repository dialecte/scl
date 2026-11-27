import isdTemplateWithOtherSubNetworkSettings from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised-with-other-subnetwork-settings.xml?raw'
import projectSouth from '../integration/ied/fixtures/project-south-with-relay-r1-and-bay-q01-to-place-into.xml?raw'
import vendorIcdOf2003 from './fixtures/icd-p1-of-the-2003-edition-with-a-process-of-one-lnode.xml?raw'
import vendorIcd from './fixtures/icd-p1-of-the-2007-b-4-edition-on-w1-with-its-own-subnetwork-settings.xml?raw'
import vendorIcdOfCurrentEdition from './fixtures/icd-p1-of-the-current-edition-its-header-naming-its-file.xml?raw'
import vendorIcdWithProcess from './fixtures/icd-p1-stating-its-original-edition-with-a-substation-of-two-lnodes.xml?raw'
import isdInstanceOnStationBusWithBitRate from './fixtures/isd-instance-of-bcu1-on-a-station-bus-with-a-bit-rate.xml?raw'
import projectOnW1WithSettings from './fixtures/project-on-w1-with-its-own-bit-rate-and-text.xml?raw'
import projectOnBareW1 from './fixtures/project-on-w1-without-settings.xml?raw'
import projectOnStationBusWithoutBitRate from './fixtures/project-west-on-a-station-bus-without-a-bit-rate.xml?raw'

import { describe, expect } from 'vitest'

import { readAttribute } from '@/v2019C1/helpers'
import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

/** A vendor ICD of the first edition: its root states no version (inline: a first-edition file is no fixture file). */
const vendorIcdOfFirstEdition = /* xml */ `
<SCL xmlns="http://www.iec.ch/61850/2003/SCL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<Header id="P1_ICD" version="1" revision="A"/>
	<IED name="TEMPLATE" manufacturer="ACME" type="P1">
		<AccessPoint name="AP1">
			<Server>
				<Authentication/>
				<LDevice inst="LD0">
					<LN0 lnClass="LLN0" inst="" lnType="A_LLN0"/>
				</LDevice>
			</Server>
		</AccessPoint>
	</IED>
	<DataTypeTemplates>
		<LNodeType id="A_LLN0" lnClass="LLN0">
			<DO name="Beh" type="A_ENS"/>
		</LNodeType>
		<DOType id="A_ENS" cdc="ENS">
			<DA name="stVal" bType="Enum" type="A_Beh" fc="ST"/>
		</DOType>
		<EnumType id="A_Beh">
			<EnumVal ord="1">on</EnumVal>
		</EnumType>
	</DataTypeTemplates>
</SCL>
`

/** Why the first-edition ICD is given on purpose. */
const FIRST_EDITION_ICD = 'a vendor ICD of the first edition, its root stating no version'

type PlacementCase = SclTest.BaseXmlTestCase & {
	sourceFileName: string
	scenario?: LifecycleScenario
}

// A first placement joining a subnetwork the project holds brings its connections only: the subnetwork's own settings
// (its bit rate, its text, its private data) stay the project's, whatever the file holds or the project lacks, and the
// report lists only the connection. (A subnetwork the project lacks, and a project without Communication: pinned in
// apply-ied.test.ts.)
describe('tx.lifecycle.apply - the subnetwork a first placement of an IED joins', () => {
	const testCases: SclTest.TestCases<PlacementCase> = {
		// vendorIcd: 2007 B 4, no uuid, IED TEMPLATE (ACME P1) on W1 with the vendor's bit rate 10, text and private data
		'a vendor ICD placed on the project W1, which has its own bit rate and text → its connection added beside X, the bit rate 100 and the project text kept, no vendor private data':
			{
				sourceXml: vendorIcd,
				targetXml: projectOnW1WithSettings,
				sourceFileName: 'P1.icd',
				expectedQueries: [
					'/default:SCL/default:Communication/default:SubNetwork[@name="W1"][count(default:ConnectedAP)=2][count(default:Text)=1][default:Text[.="project bus"]][count(default:BitRate)=1]/default:BitRate[.="100"]',
					'/default:SCL/default:Communication/default:SubNetwork[@name="W1"]/default:ConnectedAP[@iedName="TEMPLATE"][@apName="AP1"]/default:Address/default:P[.="10.0.0.1"]',
				],
				unexpectedQueries: [
					'/default:SCL/default:Communication/default:SubNetwork[@name="W1"]/default:Private',
				],
			},
		// vendorIcd: on W1 with the vendor's bit rate 10, text and private data; the project's W1 has none of them
		'the vendor ICD placed on the project W1, which has no bit rate → its connection added, the subnetwork still without a bit rate or a text':
			{
				sourceXml: vendorIcd,
				targetXml: projectOnBareW1,
				sourceFileName: 'P1.icd',
				expectedQueries: [
					'/default:SCL/default:Communication/default:SubNetwork[@name="W1"][count(default:ConnectedAP)=2][not(default:BitRate)][not(default:Text)][not(default:Private)]',
				],
			},
		// isdTemplateWithOtherSubNetworkSettings: the bay controller's template ISD whose StationBus has type IP and a bit rate
		'a template ISD whose station bus has a bit rate, placed in project South, whose station bus has none → its connection added, the station bus still without a bit rate':
			{
				sourceXml: isdTemplateWithOtherSubNetworkSettings,
				targetXml: projectSouth,
				sourceFileName: 'BCU_Template.isd',
				expectedQueries: [
					'/default:SCL/default:Communication[count(default:SubNetwork)=1]/default:SubNetwork[@name="StationBus"][@type="8-MMS"][count(default:ConnectedAP)=2][not(default:BitRate)]',
				],
			},
	}

	runSclTestCases.withExport({ testCases, act: placeAndCheckReport })
})

// The original edition of an IED placed from a device file of a previous edition that states none is the edition of its
// file, as an import upgrades it (a root stating no version is a 2003 file); one stated is kept; a file of the current
// edition keeps the schema's default. The file's process part is never placed.
describe('tx.lifecycle.apply - the original edition of an IED placed from a device file', () => {
	const testCases: SclTest.TestCases<PlacementCase> = {
		// vendorIcd: root 2007 B 4, its IED TEMPLATE states no original edition
		'a 2007 B 4 vendor ICD whose IED states none → 2007 B 4 from the file': {
			sourceXml: vendorIcd,
			targetXml: projectOnBareW1,
			sourceFileName: 'P1.icd',
			expectedQueries: [
				'/default:SCL/default:IED[@name="TEMPLATE"][@originalSclVersion="2007"][@originalSclRevision="B"][@originalSclRelease="4"]',
			],
		},
		// vendorIcdWithProcess: IED stating its original edition 2007 A, a Substation TEMPLATE of two LNodes
		'a vendor ICD whose IED states 2007 A → kept as it is, its substation not placed': {
			sourceXml: vendorIcdWithProcess,
			targetXml: projectOnBareW1,
			sourceFileName: 'P1.icd',
			expectedQueries: [
				'/default:SCL/default:IED[@name="TEMPLATE"][@originalSclVersion="2007"][@originalSclRevision="A"][not(@originalSclRelease)]',
			],
			unexpectedQueries: ['/default:SCL/default:Substation'],
		},
		// vendorIcdOf2003: root version 2003, a Process TEMPLATE of one LNode
		'a 2003 vendor ICD → 2003 and no revision, its process not placed': {
			sourceXml: vendorIcdOf2003,
			targetXml: projectOnBareW1,
			sourceFileName: 'P1.icd',
			expectedQueries: [
				'/default:SCL/default:IED[@name="TEMPLATE"][@originalSclVersion="2003"][not(@originalSclRevision)][not(@originalSclRelease)]',
			],
			unexpectedQueries: ['/default:SCL/default:Process'],
		},
		// vendorIcdOfFirstEdition: its root states no version (a first edition file)
		'a vendor ICD whose root states no version → 2003 and no revision': {
			sourceXml: vendorIcdOfFirstEdition,
			editionOneRoot: FIRST_EDITION_ICD,
			targetXml: projectOnBareW1,
			sourceFileName: 'P1.icd',
			expectedQueries: [
				'/default:SCL/default:IED[@name="TEMPLATE"][@originalSclVersion="2003"][not(@originalSclRevision)][not(@originalSclRelease)]',
			],
		},
		// vendorIcdOfCurrentEdition: root 2007 C 5, its IED states no original edition
		'a vendor ICD of the current edition whose IED states none → nothing written': {
			sourceXml: vendorIcdOfCurrentEdition,
			targetXml: projectOnBareW1,
			sourceFileName: 'P1.icd',
			expectedQueries: [
				'/default:SCL/default:IED[@name="TEMPLATE"][not(@originalSclVersion)][not(@originalSclRevision)]',
			],
		},
	}

	runSclTestCases.withExport({ testCases, act: placeAndCheckReport })
})

// The file a placed IED came from is recorded with the file uuid its Header gives when the file holds one of its own (an
// edition from 2007 C 5 on); a file of an earlier edition is recorded by its name only. A device file is recorded
// whatever the scenario, a fork included.
describe('tx.lifecycle.apply - the source file a first placement of an IED records', () => {
	const testCases: SclTest.TestCases<PlacementCase> = {
		// vendorIcd: root 2007 B 4, its Header naming no file
		'a 2007 B 4 vendor ICD → recorded by name, version and revision, no file uuid': {
			sourceXml: vendorIcd,
			targetXml: projectOnBareW1,
			sourceFileName: 'P1.icd',
			expectedQueries: [
				'/default:SCL/default:IED[@name="TEMPLATE"]/default:IEDSourceFiles/default:SclFileReference[@fileType="ICD"][@fileName="P1.icd"][@version="3"][@revision="A"][not(@fileUuid)]',
			],
		},
		// vendorIcdOfFirstEdition: its root states no version
		'a vendor ICD whose root states no version → recorded with no file uuid': {
			sourceXml: vendorIcdOfFirstEdition,
			editionOneRoot: FIRST_EDITION_ICD,
			targetXml: projectOnBareW1,
			sourceFileName: 'P1.icd',
			expectedQueries: [
				'/default:SCL/default:IED[@name="TEMPLATE"]/default:IEDSourceFiles/default:SclFileReference[@fileType="ICD"][@fileName="P1.icd"][not(@fileUuid)]',
			],
		},
		// vendorIcdOfCurrentEdition: root 2007 C 5, its Header uuid a1000000-…-001
		'a vendor ICD of the current edition → recorded with its Header uuid': {
			sourceXml: vendorIcdOfCurrentEdition,
			targetXml: projectOnBareW1,
			sourceFileName: 'P1.icd',
			expectedQueries: [
				'/default:SCL/default:IED[@name="TEMPLATE"]/default:IEDSourceFiles/default:SclFileReference[@fileType="ICD"][@fileUuid="a1000000-0000-4000-8000-000000000001"][@version="4"]',
			],
		},
		// vendorIcdOfCurrentEdition: placed as a fork, keeping the file's uuids
		'the vendor ICD of the current edition placed as a fork → its IED keeps the file uuids and records the ICD':
			{
				sourceXml: vendorIcdOfCurrentEdition,
				targetXml: projectOnBareW1,
				sourceFileName: 'P1.icd',
				scenario: 'fork',
				expectedQueries: [
					'/default:SCL/default:IED[@name="TEMPLATE"][not(@templateUuid)]/default:IEDSourceFiles/default:SclFileReference[@fileType="ICD"][@fileUuid="a1000000-0000-4000-8000-000000000001"]',
				],
			},
	}

	runSclTestCases.withExport({ testCases, act: placeAndCheckReport })
})

// The fork `update.ied` makes into a project holding none of its IED is a first placement too: joining a subnetwork the
// project holds by name, it brings its connection only, the subnetwork's own settings staying the project's.
describe('tx.lifecycle.update.ied - the subnetwork a fork placement joins', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// isdInstanceOnStationBusWithBitRate: BCU1 on StationBus, the file's subnetwork with a bit rate of 100
		'the instance ISD of BCU1 forked into the project StationBus, which has no bit rate → BCU1 connected, the subnetwork still without a bit rate':
			{
				sourceXml: isdInstanceOnStationBusWithBitRate,
				targetXml: projectOnStationBusWithoutBitRate,
				expectedQueries: [
					'/default:SCL/default:Communication/default:SubNetwork[@name="StationBus"][count(default:ConnectedAP)=2]/default:ConnectedAP[@iedName="BCU1"][@apName="AP1"]',
				],
				unexpectedQueries: [
					'/default:SCL/default:Communication/default:SubNetwork[@name="StationBus"]/default:BitRate',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const sourceQuery = await importSource({
			project,
			xml: testCase.sourceXml,
			fileName: 'BCU1.isd',
		})
		const iedRef = await onlyIed({ sourceQuery })
		const anchor = await projectRoot(target.query)
		await target.transaction(async function forkIed(tx) {
			await tx.lifecycle.update.ied({
				sourceQuery,
				iedRef,
				anchor,
				fileType: 'ISD',
				scenario: 'fork',
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// The same device file placed twice is two IEDs: the second numbered, each connected beside the other on the subnetwork
// the project holds, whose settings stay the project's both times, each recording the file by its name.
describe('tx.lifecycle.apply - the same ICD placed twice', () => {
	const testCases: SclTest.TestCases<PlacementCase> = {
		// vendorIcd: 2007 B 4, no uuid, IED TEMPLATE on W1 with the vendor's bit rate 10, text and private data
		'the vendor ICD placed twice on the project W1, which has its own bit rate and text → TEMPLATE and TEMPLATE_1, both connected, the bit rate 100 and the project text kept, each recording P1.icd':
			{
				sourceXml: vendorIcd,
				targetXml: projectOnW1WithSettings,
				sourceFileName: 'P1.icd',
				expectedQueries: [
					'/default:SCL[count(default:IED[@name="TEMPLATE"])=1][count(default:IED[@name="TEMPLATE_1"])=1]',
					'/default:SCL/default:Communication/default:SubNetwork[@name="W1"][count(default:ConnectedAP)=3][count(default:Text)=1][count(default:BitRate)=1]/default:BitRate[.="100"]',
					'/default:SCL/default:Communication/default:SubNetwork[@name="W1"][default:ConnectedAP[@iedName="TEMPLATE"]]/default:ConnectedAP[@iedName="TEMPLATE_1"]',
					'/default:SCL/default:IED[@name="TEMPLATE"]/default:IEDSourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileName="P1.icd"][not(@fileUuid)]',
					'/default:SCL/default:IED[@name="TEMPLATE_1"]/default:IEDSourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileName="P1.icd"][not(@fileUuid)]',
				],
				unexpectedQueries: [
					'/default:SCL/default:Communication/default:SubNetwork[@name="W1"]/default:Private',
				],
			},
	}

	async function act(params: SclTest.ActParams<PlacementCase>): Promise<SclTest.ActResult> {
		await placeAndCheckReport(params)
		return placeAndCheckReport(params)
	}

	runSclTestCases.withExport({ testCases, act })
})

/** Place the case's IED (one report, one apply), checking the report listed nothing of a joined subnetwork's settings. */
async function placeAndCheckReport({
	project,
	target,
	testCase,
}: SclTest.ActParams<PlacementCase>): Promise<SclTest.ActResult> {
	if (!target) throw new Error('target required')
	const sourceQuery = await importSource({
		project,
		xml: testCase.sourceXml,
		fileName: testCase.sourceFileName,
	})
	const ref = await onlyIed({ sourceQuery })
	const anchor = await projectRoot(target.query)
	const lifecycle = { verb: 'ied', sourceQuery, ref, anchor, scenario: testCase.scenario } as const
	const report = await target.query.lifecycle.report(lifecycle)
	await target.transaction(async function applyIed(tx) {
		await tx.lifecycle.apply({ ...lifecycle, report })
	})
	expect(settingsListed(report)).toEqual([])
	return { assertOn: 'target' }
}

/** The subnetwork settings a report lists added: a bit rate, a text, private data. */
function settingsListed(report: DiffReport): string[] {
	return report.instances
		.flatMap((instance) => instance.groups)
		.flatMap((group) => group.companions)
		.filter(
			(node) => node.change === 'added' && ['BitRate', 'Text', 'Private'].includes(node.tagName),
		)
		.map((node) => node.tagName)
}

/** A source file imported into the test project, by name, as a read query. */
async function importSource(params: {
	project: SclTest.ActParams<SclTest.BaseXmlTestCase>['project']
	xml: string
	fileName: string
}): Promise<Core.Query<Config>> {
	const { project, xml, fileName } = params
	const imported = await project.importFile(new File([xml], fileName, { type: 'text/xml' }))
	return project.openDocument(imported.documentId).query
}

/** The first IED of a source file. */
async function onlyIed(params: { sourceQuery: Core.Query<Config> }): Promise<Scl.Ref<'IED'>> {
	const [ied] = await params.sourceQuery.getRecordsByTagName('IED')
	if (!ied || !readAttribute({ record: ied, name: 'name' }))
		throw new Error('the source holds no IED')
	return { tagName: 'IED', id: ied.id }
}

/** The root of the project the IED is placed under. */
async function projectRoot(query: Core.Query<Config>): Promise<Scl.Ref<'SCL'>> {
	const root = await query.getRoot()
	return { tagName: 'SCL', id: root.id }
}
