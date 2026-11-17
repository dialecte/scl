/// <reference types="vite/client" />

import AOnOneBayWithLineageAndProvenanceXml from './fixtures/a-on-one-bay-with-lineage-and-provenance.xml?raw'
import AOnTwoBaysXml from './fixtures/a-on-two-bays.xml?raw'
import AOnTwoSubstationsXml from './fixtures/a-on-two-substations.xml?raw'
import LineWithAFunctionOnAAndTwoBreakersXml from './fixtures/line-with-a-function-on-a-and-two-breakers.xml?raw'
import ProcessRootOnAXml from './fixtures/process-root-on-a.xml?raw'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const emptyIsd = /* xml */ `<SCL ${ns} ${id}="empty-isd"/>`

/** Every identifier the project holds, its function template's lineage aside. */
const PROJECT_UUIDS = [
	'10000000-0000-4000-8000-000000000001',
	'11000000-0000-4000-8000-000000000001',
	'11000000-0000-4000-8000-000000000002',
	'11000000-0000-4000-8000-000000000003',
	'11000000-0000-4000-8000-000000000004',
	'11000000-0000-4000-8000-000000000005',
	'12000000-0000-4000-8000-000000000001',
	'12000000-0000-4000-8000-000000000003',
	'20000000-0000-4000-8000-00000000000a',
	'30000000-0000-4000-8000-00000000000a',
	'31000000-0000-4000-8000-000000000001',
	'40000000-0000-4000-8000-00000000000a',
	'50000000-0000-4000-8000-0000000000a1',
	'50000000-0000-4000-8000-0000000000a2',
	'50000000-0000-4000-8000-0000000000a3',
	'60000000-0000-4000-8000-0000000000a1',
	'80000000-0000-4000-8000-000000000001',
	'80000000-0000-4000-8000-000000000002',
	'80000000-0000-4000-8000-000000000003',
	'90000000-0000-4000-8000-000000000001',
	'd0000000-0000-4000-8000-000000000001',
	'e0000000-0000-4000-8000-000000000001',
	'e0000000-0000-4000-8000-000000000002',
	'e0000000-0000-4000-8000-000000000009',
]

describe('an ISD template names its IED SPECIFICATION', () => {
	const testCases: SclTest.TestCases = {
		// the fixture: A placed from a template, its LNodes in F1 and under breaker QA1, A on N1, A the receiver of its own gcb1
		'A → IED SPECIFICATION, its LNodes, their specified naming, its connection and its own receiver naming it':
			{
				sourceXml: AOnOneBayWithLineageAndProvenanceXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'/default:SCL/default:Header[@id="isd_specification"]',
					'/default:SCL[count(default:IED)=1]/default:IED[@name="SPECIFICATION"]',
					'//default:GSEControl[@name="gcb1"]/default:IEDName[.="SPECIFICATION"]',
					'/default:SCL/default:Communication/default:SubNetwork[@name="N1"]/default:ConnectedAP[@iedName="SPECIFICATION"][@apName="AP1"]',
					'//default:Function[@name="F1"]/default:LNode[@lnClass="PTRC"][@iedName="SPECIFICATION"]/default:Private/v2019C1:LNodeSpecNaming[@sIedName="SPECIFICATION"]',
					'//default:EqFunction/default:LNode[@lnClass="XCBR"][@iedName="SPECIFICATION"]',
				],
				unexpectedQueries: ['//*[@iedName="A"]', '//*[@sIedName="A"]', '//default:IEDName[.="A"]'],
			},
	}

	runSclTestCases.withExport({ testCases, act: exportTemplate })
})

describe('an ISD template names the levels above its functions TEMPLATE, unless two sit side by side', () => {
	const testCases: SclTest.TestCases = {
		// the fixture: A's LNodes in one bay B1 of V1 of S1, a flow named by path and uuid, QA1 on CN1 by path and uuid
		'A on one bay → substation, voltage level and bay TEMPLATE, paths through them following': {
			sourceXml: AOnOneBayWithLineageAndProvenanceXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'/default:SCL/default:Substation[@name="TEMPLATE"]/default:VoltageLevel[@name="TEMPLATE"]/default:Bay[@name="TEMPLATE"]/default:Function[@name="F1"]',
				'//default:LNode[@lnClass="RREC"]//v2019C1:SourceRef[@source="TEMPLATE/TEMPLATE/TEMPLATE/F1/PTRC1.Op.general"]',
				'//default:Bay/default:ConnectivityNode[@name="CN1"][@pathName="TEMPLATE/TEMPLATE/TEMPLATE/CN1"]',
				'//default:ConductingEquipment[@name="QA1"]/default:Terminal[@connectivityNode="TEMPLATE/TEMPLATE/TEMPLATE/CN1"]',
			],
			unexpectedQueries: [
				'//*[@name="S1" or @name="V1" or @name="B1"]',
				'//@*[contains(., "S1/V1/B1")]',
			],
		},
		// the fixture: A's LNodes in two bays B1 and B2 of one voltage level V1
		'A on two bays of one voltage level → substation and voltage level TEMPLATE, the bays side by side keeping their names':
			{
				sourceXml: AOnTwoBaysXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'/default:SCL/default:Substation[@name="TEMPLATE"]/default:VoltageLevel[@name="TEMPLATE"][count(default:Bay)=2]/default:Bay[@name="B1"]/default:Function[@name="F1"]',
					'/default:SCL/default:Substation/default:VoltageLevel/default:Bay[@name="B2"]/default:Function[@name="F2"]',
				],
				unexpectedQueries: ['//default:Bay[@name="TEMPLATE"]'],
			},
		// the fixture: A's LNodes in two substations S1 and S2, one voltage level and one bay in each
		'A in two substations → the substations side by side keeping their names, the voltage level and bay alone in each TEMPLATE':
			{
				sourceXml: AOnTwoSubstationsXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'/default:SCL[count(default:Substation)=2]/default:Substation[@name="S1"]/default:VoltageLevel[@name="TEMPLATE"]/default:Bay[@name="TEMPLATE"]/default:Function[@name="F1"]',
					'/default:SCL/default:Substation[@name="S2"]/default:VoltageLevel[@name="TEMPLATE"]/default:Bay[@name="TEMPLATE"]/default:Function[@name="F2"]',
				],
				unexpectedQueries: ['//default:Substation[@name="TEMPLATE"]'],
			},
		// the fixture: A's LNode in a function of line L1
		'A on a line → line TEMPLATE': {
			sourceXml: LineWithAFunctionOnAAndTwoBreakersXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'/default:SCL/default:Line[@name="TEMPLATE"]/default:Function[@name="LineProtection"]',
			],
			unexpectedQueries: ['//*[@name="L1"]'],
		},
		// the fixture: A's LNode in a function of process Plant
		'A in a process → process TEMPLATE': {
			sourceXml: ProcessRootOnAXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'/default:SCL/default:Process[@name="TEMPLATE"]/default:Function[@name="PlantProtection"]',
			],
			unexpectedQueries: ['//*[@name="Plant"]'],
		},
	}

	runSclTestCases.withExport({ testCases, act: exportTemplate })
})

describe('an ISD template holds identifiers of its own and no link to the project', () => {
	const testCases: SclTest.TestCases = {
		// the fixture: every element of A's part named by a uuid of the project, references between them by uuid
		'A → every uuid new, the references in the file resolving onto the new ones': {
			sourceXml: AOnOneBayWithLineageAndProvenanceXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'/default:SCL/default:IED[string-length(@uuid)=36]',
				'//default:LNode[@lnClass="PTRC"][@lnUuid=//default:LN[@lnClass="PTRC"]/@uuid]',
				'//default:LNode[@lnClass="XCBR"][@lnUuid=//default:LN[@lnClass="XCBR"]/@uuid]',
				'//v2019C1:SourceRef[@sourceLNodeUuid=//default:LNode[@lnClass="PTRC"]/@uuid]',
				'//default:ConnectedAP[@apUuid=//default:AccessPoint[@name="AP1"]/@uuid]',
				'//default:Terminal[@cNodeUuid=//default:ConnectivityNode[@name="CN1"]/@uuid]',
			],
			unexpectedQueries: PROJECT_UUIDS.map((uuid) => `//@*[.="${uuid}"]`),
		},
		// the fixture: A with a templateUuid (and its LN PTRC), B1 of a bay template, F1 of a function template
		'A placed from a template, B1 of a bay template, F1 of a function template → only F1 keeps its lineage':
			{
				sourceXml: AOnOneBayWithLineageAndProvenanceXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:Function[@name="F1"][@templateUuid="f0000000-0000-4000-8000-000000000001"]',
				],
				unexpectedQueries: [
					'//default:IED[@templateUuid or @originUuid]',
					'//default:IED//*[@templateUuid or @originUuid]',
					'//default:Bay[@templateUuid]',
				],
			},
		// the fixture: the project's Header, A listing in IEDSourceFiles the ISD it came from
		'A listing the file it came from, extracted from a project file → no source file recorded': {
			sourceXml: AOnOneBayWithLineageAndProvenanceXml,
			targetXml: emptyIsd,
			unexpectedQueries: ['//default:SclFileReference', '//default:IEDSourceFiles'],
		},
	}

	runSclTestCases.withExport({ testCases, act: exportTemplate })
})

async function exportTemplate({
	source,
	target,
}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
	if (!target) throw new Error('target required')
	await target.transaction(async function extract(tx) {
		await tx.lifecycle.extract.ied({
			sourceQuery: source.query,
			iedRef: { tagName: 'IED', id: 'ied-a' },
			fileType: 'ISD',
			kind: 'template',
			inputs: 'none',
			issuer: 'TEST_ISSUER',
			tool: 'TEST',
			who: 'engineer',
		})
	})
	return { assertOn: 'target' }
}
