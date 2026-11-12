import isdInstanceOfBcu1 from './fixtures/isd-instance-of-bcu1-from-project-north.xml?raw'
import isdTemplateRevised from './fixtures/isd-template-of-a-bay-controller-revised.xml?raw'
import isdTemplate from './fixtures/isd-template-of-a-bay-controller.xml?raw'
import projectNorth from './fixtures/project-north-with-bcu1-placed-from-the-template-first-revision.xml?raw'
import projectSouth from './fixtures/project-south-with-relay-r1-and-bay-q01-to-place-into.xml?raw'

import { describe, expect } from 'vitest'

import { collectSclOutputViolations, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

/**
 * The S-IED ISD fixtures the IED placement and update tests read. The template's two revisions share their Header and
 * element uuids and name no source file; the instance is the template's first revision placed in project North (its
 * uuids carry the template's as templateUuid) and exported from it, its Header naming the project file only. Project
 * North holds that placed instance; project South is where an ISD is placed.
 */

type OpenedAsFileCase = SclTest.BaseXmlTestCase & { fileName: string }

describe('the S-IED ISD fixtures opened as files', () => {
	const testCases: SclTest.TestCases<OpenedAsFileCase> = {
		'template ISD of a bay controller → no import finding, no violation': {
			sourceXml: isdTemplate,
			fileName: 'BCU_Template.isd',
		},
		'revised template ISD of a bay controller → no import finding, no violation': {
			sourceXml: isdTemplateRevised,
			fileName: 'BCU_Template.isd',
		},
		'instance ISD of BCU1 exported from project North → no import finding, no violation': {
			sourceXml: isdInstanceOfBcu1,
			fileName: 'BCU1.isd',
		},
		'project North holding BCU1 placed from the template → no import finding, no violation': {
			sourceXml: projectNorth,
			fileName: 'North.ssd',
		},
		'project South to place into → no import finding, no violation': {
			sourceXml: projectSouth,
			fileName: 'South.scd',
		},
	}

	async function act({ project, testCase }: SclTest.ActParams<OpenedAsFileCase>): Promise<void> {
		const opened = await project.importFile(
			new File([testCase.sourceXml], testCase.fileName, { type: 'text/xml' }),
		)
		expect(opened.diagnostics).toEqual([])
		const report = await collectSclOutputViolations({
			project,
			document: project.openDocument(opened.documentId),
		})
		expect(report.violations).toEqual([])
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('the S-IED ISD fixtures hold what the placement and update tests read', () => {
	const testCases: SclTest.TestCases = {
		'template ISD of a bay controller → SPECIFICATION in a TEMPLATE bay, two LDevices, two functions':
			{
				// IED SPECIFICATION: CTRL (DataSet + GOOSE, CSWI, CILO with a later-binding input, LPHD), PROT (LPHD, PTOC setVal 100, PTRC)
				sourceXml: isdTemplate,
				expectedQueries: [
					'/default:SCL/default:Header[@fileType="ISD"][@uuid="f0000000-0000-4000-8000-000000000001"][@version="0"][@revision="1"][count(default:History/default:Hitem)=1]',
					'/default:SCL[count(default:IED)=1]/default:IED[@name="SPECIFICATION"][@uuid="a0000000-0000-4000-8000-000000000030"]/default:AccessPoint[@name="AP1"]/default:Server[count(default:LDevice)=2]',
					'//default:LDevice[@inst="CTRL"][count(default:LN)=3][default:LN[@lnClass="CSWI"][@inst="1"]]/default:LN0[default:DataSet[@name="Positions"]/default:FCDA[@lnClass="CSWI"][@doName="Pos"][@daName="stVal"]]/default:GSEControl[@name="PositionGoose"][@datSet="Positions"]',
					'//default:LDevice[@inst="CTRL"]/default:LN[@lnClass="CILO"][@inst="1"]/default:Inputs[count(default:ExtRef)=1]/default:ExtRef[@intAddr="BusbarDisconnectorPos"][@pLN="XSWI"][@pDO="Pos"][@pDA="stVal"][@pServT="GOOSE"][not(@iedName or @ldInst or @lnClass or @doName or @srcCBName)]',
					'/default:SCL/default:IED[@name="SPECIFICATION"]//default:LDevice[@inst="CTRL"][default:LN[@lnClass="LPHD"][@inst="1"][@lnType="LPHD_T"]]/../default:LDevice[@inst="PROT"]/default:LN[@lnClass="LPHD"][@inst="1"][@lnType="LPHD_T"]',
					'//default:LDevice[@inst="PROT"][count(default:LN)=3][default:LN[@lnClass="PTRC"][@inst="1"]]/default:LN[@lnClass="PTOC"][@inst="1"]/default:DOI[@name="OpDlTmms"]/default:DAI[@name="setVal"]/default:Val[text()="100"]',
					'/default:SCL/default:Substation[@name="TEMPLATE"]/default:VoltageLevel[@name="TEMPLATE"]/default:Bay[@name="TEMPLATE"][count(default:Function)=2]/default:Function[@name="BayControl"][@uuid="a0000000-0000-4000-8000-000000000004"][count(default:LNode)=2][default:LNode[@lnClass="CSWI"][@lnUuid="a0000000-0000-4000-8000-000000000021"]]/default:LNode[@iedName="SPECIFICATION"][@ldInst="CTRL"][@lnClass="CILO"][@lnUuid="a0000000-0000-4000-8000-000000000022"]',
					'//default:Bay[@name="TEMPLATE"]/default:Function[@name="LineProtection"][@uuid="a0000000-0000-4000-8000-000000000005"][count(default:LNode)=2][default:LNode[@lnClass="PTOC"][@lnUuid="a0000000-0000-4000-8000-000000000023"]]/default:LNode[@iedName="SPECIFICATION"][@ldInst="PROT"][@lnClass="PTRC"][@lnUuid="a0000000-0000-4000-8000-000000000024"]',
					'/default:SCL/default:Communication/default:SubNetwork[@name="StationBus"]/default:ConnectedAP[@iedName="SPECIFICATION"][@apName="AP1"]',
				],
				unexpectedQueries: [
					'//*[@templateUuid]',
					'//default:LN[@lnClass="RREC"]',
					'//default:SclFileReference',
					'//default:LNode[@lnClass="LPHD"]',
					'//default:LN[@lnClass="LGOS" or @lnClass="LSVS"]',
				],
			},
		'revised template ISD → same file one revision on: RREC added, PTRC removed, setVal 150, function renamed':
			{
				// the template's Header and element uuids; LineProtection (uuid ...005) renamed FeederProtection
				sourceXml: isdTemplateRevised,
				expectedQueries: [
					'/default:SCL/default:Header[@fileType="ISD"][@uuid="f0000000-0000-4000-8000-000000000001"][@version="0"][@revision="2"][count(default:History/default:Hitem)=2]',
					'/default:SCL/default:IED[@name="SPECIFICATION"][@uuid="a0000000-0000-4000-8000-000000000030"]//default:LDevice[@inst="PROT"][count(default:LN)=3][default:LN[@lnClass="LPHD"][@uuid="a0000000-0000-4000-8000-000000000028"]][default:LN[@lnClass="RREC"][@inst="1"][@uuid="a0000000-0000-4000-8000-000000000026"]]/default:LN[@lnClass="PTOC"][@uuid="a0000000-0000-4000-8000-000000000023"]/default:DOI[@name="OpDlTmms"]/default:DAI[@name="setVal"]/default:Val[text()="150"]',
					'/default:SCL/default:IED/default:AccessPoint[@name="AP1"][@uuid="a0000000-0000-4000-8000-000000000031"]/default:Server[default:LDevice[@inst="PROT"][@uuid="a0000000-0000-4000-8000-000000000034"]]/default:LDevice[@inst="CTRL"][@uuid="a0000000-0000-4000-8000-000000000032"][count(default:LN)=3][default:LN[@lnClass="LPHD"][@uuid="a0000000-0000-4000-8000-000000000027"]][default:LN0[default:DataSet[@name="Positions"][@uuid="a0000000-0000-4000-8000-000000000035"]]/default:GSEControl[@name="PositionGoose"][@uuid="a0000000-0000-4000-8000-000000000033"]]/default:LN[@lnClass="CILO"][@uuid="a0000000-0000-4000-8000-000000000022"]/default:Inputs/default:ExtRef[@intAddr="BusbarDisconnectorPos"][@pLN="XSWI"][@uuid="a0000000-0000-4000-8000-000000000036"]',
					'//default:Bay[@name="TEMPLATE"][count(default:Function)=2]/default:Function[@name="FeederProtection"][@uuid="a0000000-0000-4000-8000-000000000005"][count(default:LNode)=2][default:LNode[@lnClass="PTOC"][@uuid="a0000000-0000-4000-8000-000000000013"]]/default:LNode[@lnClass="RREC"][@uuid="a0000000-0000-4000-8000-000000000015"][@lnUuid="a0000000-0000-4000-8000-000000000026"]',
					'//default:Bay[@name="TEMPLATE"]/default:Function[@name="BayControl"][@uuid="a0000000-0000-4000-8000-000000000004"][count(default:LNode)=2][default:LNode[@lnClass="CSWI"][@uuid="a0000000-0000-4000-8000-000000000011"]]/default:LNode[@lnClass="CILO"][@uuid="a0000000-0000-4000-8000-000000000012"]',
				],
				unexpectedQueries: [
					'//default:LN[@lnClass="PTRC"]',
					'//default:LNode[@lnClass="PTRC"]',
					'//default:Function[@name="LineProtection"]',
					'//default:Val[text()="100"]',
					'//default:SclFileReference',
				],
			},
		'instance ISD of BCU1 → project names and uuids, template uuids kept, the project file named at the Header':
			{
				// placed from the template's first revision in North / E1 / Q01, then exported: every b... uuid has its a... twin
				sourceXml: isdInstanceOfBcu1,
				expectedQueries: [
					'/default:SCL/default:Header[@fileType="ISD"][@uuid="f0000000-0000-4000-8000-000000000002"]/default:SourceFiles/default:SclFileReference[@fileType="SSD"][@fileName="North.ssd"][@fileUuid="f0000000-0000-4000-8000-000000000020"][@version="3"][@revision="B"]',
					'/default:SCL[count(default:IED)=1]/default:IED[@name="BCU1"][@uuid="b0000000-0000-4000-8000-000000000030"][@templateUuid="a0000000-0000-4000-8000-000000000030"][@manufacturer="ISSUER"]',
					'//default:IED[@name="BCU1"]//default:LDevice[@inst="PROT"][count(default:LN)=3][default:LN[@lnClass="LPHD"][@uuid="b0000000-0000-4000-8000-000000000028"][@templateUuid="a0000000-0000-4000-8000-000000000028"]]/default:LN[@lnClass="PTOC"][@uuid="b0000000-0000-4000-8000-000000000023"][@templateUuid="a0000000-0000-4000-8000-000000000023"]/default:DOI[@name="OpDlTmms"]/default:DAI[@name="setVal"]/default:Val[text()="100"]',
					'//default:IED[@name="BCU1"]//default:LDevice[@inst="CTRL"][count(default:LN)=3][default:LN[@lnClass="LPHD"]]/default:LN[@lnClass="CILO"]/default:Inputs/default:ExtRef[@intAddr="BusbarDisconnectorPos"][@pLN="XSWI"][not(@iedName or @srcCBName)]',
					'/default:SCL/default:Substation[@name="North"][@uuid="b0000000-0000-4000-8000-000000000001"][not(@templateUuid)]/default:VoltageLevel[@name="E1"]/default:Bay[@name="Q01"][count(default:Function)=2]/default:Function[@name="LineProtection"][@uuid="b0000000-0000-4000-8000-000000000005"][@templateUuid="a0000000-0000-4000-8000-000000000005"]/default:LNode[@iedName="BCU1"][@lnClass="PTRC"][@lnUuid="b0000000-0000-4000-8000-000000000024"][@templateUuid="a0000000-0000-4000-8000-000000000014"]',
					'//default:Bay[@name="Q01"]/default:Function[@name="BayControl"][@templateUuid="a0000000-0000-4000-8000-000000000004"][count(default:LNode[@iedName="BCU1"])=2]',
					'/default:SCL/default:Communication/default:SubNetwork[@name="StationBus"]/default:ConnectedAP[@iedName="BCU1"][@apName="AP1"]/default:Address/default:P[@type="IP"][text()="10.0.1.21"]',
				],
				unexpectedQueries: [
					'//*[@iedName="SPECIFICATION"]',
					'//*[@name="TEMPLATE"]',
					'//default:LN[@lnClass="RREC"]',
					'//default:IEDSourceFiles',
					'/default:SCL/default:Header/default:SourceFiles[count(default:SclFileReference)!=1]',
					'//default:LN[@lnClass="LGOS" or @lnClass="LSVS"]',
				],
			},
		"project North → BCU1 placed from the template's first revision, every element with its template twin":
			{
				// the source of the instance ISD: the IED names the template ISD as a source file, the frame is the project's
				sourceXml: projectNorth,
				expectedQueries: [
					'/default:SCL/default:Header[@fileType="SSD"][@uuid="f0000000-0000-4000-8000-000000000020"][@version="3"][@revision="B"]',
					'/default:SCL[count(default:IED)=1]/default:IED[@name="BCU1"][@uuid="b0000000-0000-4000-8000-000000000030"][@templateUuid="a0000000-0000-4000-8000-000000000030"]/default:IEDSourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="ISD"][@fileName="BCU_Template.isd"][@fileUuid="f0000000-0000-4000-8000-000000000001"][@version="0"][@revision="1"]',
					'//default:IED[@name="BCU1"]/default:AccessPoint[@uuid="b0000000-0000-4000-8000-000000000031"][@templateUuid="a0000000-0000-4000-8000-000000000031"]/default:Server[count(default:LDevice)=2]/default:LDevice[@inst="CTRL"][@templateUuid="a0000000-0000-4000-8000-000000000032"][count(default:LN)=3]/default:LN[@lnClass="CILO"][@uuid="b0000000-0000-4000-8000-000000000022"][@templateUuid="a0000000-0000-4000-8000-000000000022"]/default:Inputs/default:ExtRef[@intAddr="BusbarDisconnectorPos"][@templateUuid="a0000000-0000-4000-8000-000000000036"]',
					'//default:IED[@name="BCU1"]//default:LDevice[@inst="PROT"][count(default:LN)=3]/default:LN[@lnClass="PTOC"][@templateUuid="a0000000-0000-4000-8000-000000000023"]/default:DOI[@name="OpDlTmms"]/default:DAI[@name="setVal"]/default:Val[text()="100"]',
					'/default:SCL/default:Substation[@name="North"][not(@templateUuid)]/default:VoltageLevel[@name="E1"][not(@templateUuid)]/default:Bay[@name="Q01"][not(@templateUuid)][count(default:Function)=2]/default:Function[@name="LineProtection"][@templateUuid="a0000000-0000-4000-8000-000000000005"][count(default:LNode)=2]/default:LNode[@iedName="BCU1"][@lnClass="PTRC"][@lnUuid="b0000000-0000-4000-8000-000000000024"][@templateUuid="a0000000-0000-4000-8000-000000000014"]',
					'//default:Bay[@name="Q01"]/default:Function[@name="BayControl"][@templateUuid="a0000000-0000-4000-8000-000000000004"][count(default:LNode[@iedName="BCU1"])=2]',
				],
				unexpectedQueries: [
					'//*[@iedName="SPECIFICATION"]',
					'//*[@name="TEMPLATE"]',
					'//default:LN[@lnClass="RREC"]',
				],
			},
		'project South → an empty bay Q01 to place into, real IED R1 alone in its own bay and on the station bus':
			{
				// R1 comes from a supplier ICD; nothing named SPECIFICATION or BCU1 yet
				sourceXml: projectSouth,
				expectedQueries: [
					'/default:SCL/default:Header[@fileType="SCD"][@uuid="f0000000-0000-4000-8000-000000000030"]',
					'/default:SCL/default:Substation[@name="South"]/default:VoltageLevel[@name="E1"][count(default:Bay)=2]/default:Bay[@name="Q01"][@uuid="c0000000-0000-4000-8000-000000000003"][not(*)]',
					'//default:Bay[@name="Q02"]/default:Function[@name="BusbarProtection"]/default:LNode[@iedName="R1"][@lnClass="PDIF"][@lnUuid="c0000000-0000-4000-8000-000000000021"]',
					'/default:SCL[count(default:IED)=1]/default:IED[@name="R1"]/default:IEDSourceFiles/default:SclFileReference[@fileType="ICD"]',
					'/default:SCL/default:Communication[count(default:SubNetwork)=1]/default:SubNetwork[@name="StationBus"][count(default:ConnectedAP)=1]/default:ConnectedAP[@iedName="R1"][@apName="S1"]',
				],
				unexpectedQueries: ['//default:IED[@name="SPECIFICATION" or @name="BCU1"]'],
			},
	}

	async function act(): Promise<SclTest.ActResult> {
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
