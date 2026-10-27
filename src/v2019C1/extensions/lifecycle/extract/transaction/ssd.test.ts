import { ssd } from './ssd'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
	runSclTestCases,
} from '@/v2019C1/test'

import type { SsdExtractScope, TemplateLink } from './extract.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const scopeRef = { tagName: 'Bay', id: 'bay-1' } as Scl.Ref<'Bay'>
// the namespace a single-line-diagram editor writes its layout in
const ESLD = 'https://transpower.co.nz/SCL/SSD/SLD/v0'

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	scope?: SsdExtractScope
	templateLink?: TemplateLink
}

// Extract a bay-typical from a project: the produced SSD has an SSD Header, a TEMPLATE process
// structure, and - by consuming the application layer - the Bay's Application plus its composed
// Function and type closure, self-contained.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="scl-src">
		<Substation name="S1" templateUuid="sub-tmpl-uuid" ${id}="sub-1">
			<VoltageLevel name="V1" templateUuid="vl-tmpl-uuid" ${id}="vl-1">
				<Bay name="B1" templateUuid="bay-tmpl-uuid" ${id}="bay-1">
					<Private type="eIEC61850-6-100" ${id}="bay-priv">
						<eIEC61850-6-100:Application name="CB" type="HV" uuid="app-src-uuid" templateUuid="app-tmpl-uuid" ${id}="app-1">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-1">
								<eIEC61850-6-100:FunctionRoleContent roleInst="1" ${id}="frc-1">
									<eIEC61850-6-100:FunctionRef function="S1/Prot" functionUuid="fn-src-uuid" ${id}="app-fref-1"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
					</Private>
				</Bay>
			</VoltageLevel>
			<Function name="Prot" uuid="fn-src-uuid" templateUuid="fn-tmpl-uuid" ${id}="fn-1">
				<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="ln-src-uuid" ${id}="lnode-1"/>
			</Function>
		</Substation>
		<DataTypeTemplates ${id}="dtt-1">
			<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-1">
				<DO name="Pos" type="DPC_Type" ${id}="do-1"/>
			</LNodeType>
			<DOType id="DPC_Type" cdc="DPC" ${id}="dot-1">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-1"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>
`

describe('extract.ssd', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'extracts a bay-typical into a self-contained SSD (SSD Header + TEMPLATE structure + gathered app/function)':
			{
				sourceXml,
				targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
				expectedQueries: [
					'//default:Header[@fileType="SSD"]',
					// ancestors stay TEMPLATE; the selected entrypoint is the named, reusable root
					'//default:Substation[@name="TEMPLATE"]',
					'//default:VoltageLevel[@name="TEMPLATE"]',
					'//default:Bay[@name="B1"][@templateUuid="bay-tmpl-uuid"]',
					'//default:Bay//v2019C1:Application[@name="CB"]',
					'//default:Substation/default:Function[@name="Prot"]',
					'//default:DataTypeTemplates/default:LNodeType[@id="CSWI_Type"]',
				],
				// the bay extracted stays an instance of its template unless the consumer breaks the link
				unexpectedQueries: ['//default:VoltageLevel[@templateUuid]'],
			},
		"keeps the attributes of a namespace the dialecte does not declare (a diagram editor's esld:x / esld:h)":
			{
				sourceXml: sourceXml
					.replace(
						`<SCL ${ns} ${id}="scl-src">`,
						`<SCL ${ns} xmlns:esld="${ESLD}" ${id}="scl-src">`,
					)
					.replace(
						`<Substation name="S1" templateUuid="sub-tmpl-uuid" ${id}="sub-1">`,
						`<Substation name="S1" templateUuid="sub-tmpl-uuid" esld:w="40" ${id}="sub-1">`,
					)
					.replace(
						`<VoltageLevel name="V1" templateUuid="vl-tmpl-uuid" ${id}="vl-1">`,
						`<VoltageLevel name="V1" templateUuid="vl-tmpl-uuid" esld:x="2" ${id}="vl-1">`,
					)
					.replace(
						`<Bay name="B1" templateUuid="bay-tmpl-uuid" ${id}="bay-1">`,
						`<Bay name="B1" templateUuid="bay-tmpl-uuid" esld:h="12" ${id}="bay-1">`,
					),
				targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
				expectedQueries: [
					`//default:Substation[@*[namespace-uri()="${ESLD}" and local-name()="w"]="40"]`,
					`//default:VoltageLevel[@*[namespace-uri()="${ESLD}" and local-name()="x"]="2"]`,
					`//default:Bay[@name="B1"][@*[namespace-uri()="${ESLD}" and local-name()="h"]="12"]`,
				],
			},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await ssd(tx, {
				sourceQuery: source.query,
				scopeRef,
				tool: 'TEST',
				who: 'test',
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** A bay's application composes a function of the substation: it came with the bay's instance. */
describe('extract.ssd - a bay, the template link', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'by default: the bay and the function its application composes keep their link': {
			sourceXml,
			targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
			expectedQueries: [
				'//default:Bay[@name="B1"][@templateUuid="bay-tmpl-uuid"]',
				'//v2019C1:Application[@name="CB"][@templateUuid="app-tmpl-uuid"]',
				'//default:Function[@name="Prot"][@templateUuid="fn-tmpl-uuid"]',
			],
		},
		'templateLink break: the bay and the function its application composes lose it': {
			sourceXml,
			targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
			templateLink: 'break',
			expectedQueries: [
				'//default:Bay[@name="B1"][not(@templateUuid)]',
				// an application recording no file of its own came with the bay
				'//v2019C1:Application[@name="CB"][not(@templateUuid)]',
				'//default:Function[@name="Prot"][not(@templateUuid)]',
			],
		},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async function extractBay(tx) {
			await ssd(tx, {
				sourceQuery: source.query,
				scopeRef,
				tool: 'TEST',
				who: 'test',
				...(testCase.templateLink ? { templateLink: testCase.templateLink } : {}),
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** A substation is the template's scaffolding: renamed TEMPLATE, its voltage levels the named units. */
describe('extract.ssd - a substation', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the substation named TEMPLATE, its voltage level and bay keeping their names': {
			sourceXml,
			targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
			expectedQueries: [
				'/default:SCL/default:Substation[@name="TEMPLATE"]/default:VoltageLevel[@name="V1"]/default:Bay[@name="B1"]',
				'/default:SCL/default:Substation[@name="TEMPLATE"]/default:Function[@name="Prot"]',
			],
			unexpectedQueries: [
				'//default:Substation[@name="S1"]',
				'//default:Substation[@templateUuid]',
			],
		},
		'by default: the voltage level and its bay keep their template link, the TEMPLATE substation has none':
			{
				sourceXml,
				targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
				expectedQueries: [
					'//default:VoltageLevel[@name="V1"][@templateUuid="vl-tmpl-uuid"]/default:Bay[@name="B1"][@templateUuid="bay-tmpl-uuid"]',
					'//default:Function[@name="Prot"][@templateUuid="fn-tmpl-uuid"]',
				],
				unexpectedQueries: ['//default:Substation[@templateUuid]'],
			},
		'templateLink break: the voltage level, its bay and what came with the substation lose it': {
			sourceXml,
			targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
			templateLink: 'break',
			expectedQueries: [
				'//default:VoltageLevel[@name="V1"][not(@templateUuid)]/default:Bay[@name="B1"][not(@templateUuid)]',
				// the substation's own function, composed by the bay's application
				'//default:Substation/default:Function[@name="Prot"][not(@templateUuid)]',
			],
			unexpectedQueries: ['//default:Substation[@templateUuid]'],
		},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async function extractSubstation(tx) {
			await ssd(tx, {
				sourceQuery: source.query,
				scopeRef: { tagName: 'Substation', id: 'sub-1' },
				tool: 'TEST',
				who: 'test',
				...(testCase.templateLink ? { templateLink: testCase.templateLink } : {}),
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/**
 * A bay-typical's terminals name its connectivity nodes by uuid, path and level names: in the
 * extracted SSD they name them under the TEMPLATE scaffolding.
 */
describe('extract.ssd - connectivity', () => {
	const L1 = '00000000-0000-4000-8000-000000000001'
	const BB1 = '00000000-0000-4000-8000-000000000002'
	const connectivitySourceXml = /* xml */ `
		<SCL ${ns} ${id}="scl-src">
			<Substation name="S1" ${id}="sub-1">
				<VoltageLevel name="V1" ${id}="vl-1">
					<Bay name="B1" ${id}="bay-1">
						<ConductingEquipment name="QA1" type="CBR" ${id}="qa1">
							<Terminal connectivityNode="S1/V1/B1/L1" substationName="S1" voltageLevelName="V1" bayName="B1" cNodeName="L1" cNodeUuid="${L1}" ${id}="feeder"/>
						</ConductingEquipment>
						<ConductingEquipment name="QB1" type="DIS" ${id}="qb1">
							<Terminal connectivityNode="S1/V1/B1/L1" substationName="S1" voltageLevelName="V1" bayName="B1" cNodeName="L1" cNodeUuid="${L1}" ${id}="qb1-feeder-side"/>
							<Terminal connectivityNode="S1/V1/BB/BB1" substationName="S1" voltageLevelName="V1" bayName="BB" cNodeName="BB1" cNodeUuid="${BB1}" ${id}="qb1-busbar-side"/>
						</ConductingEquipment>
						<ConnectivityNode name="L1" pathName="S1/V1/B1/L1" uuid="${L1}" ${id}="l1"/>
					</Bay>
					<Bay name="BB" ${id}="bay-bb">
						<ConnectivityNode name="BB1" pathName="S1/V1/BB/BB1" uuid="${BB1}" ${id}="bb1"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`

	const testCases: SclTest.TestCases<TestCase> = {
		"a Bay's node and the terminals on it → named under the TEMPLATE scaffolding": {
			sourceXml: connectivitySourceXml,
			targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
			expectedQueries: [
				'//default:Bay[@name="B1"]/default:ConnectivityNode[@name="L1" and @pathName="TEMPLATE/TEMPLATE/B1/L1"]',
				'//default:ConductingEquipment[@name="QA1"]/default:Terminal[@connectivityNode="TEMPLATE/TEMPLATE/B1/L1" and @substationName="TEMPLATE" and @voltageLevelName="TEMPLATE" and @bayName="B1" and @cNodeName="L1"]',
			],
		},
		"the substation extracted → its nodes and terminals named under the TEMPLATE substation, each voltage level's name kept":
			{
				sourceXml: connectivitySourceXml,
				targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
				scope: { tagName: 'Substation', id: 'sub-1' },
				expectedQueries: [
					'//default:Bay[@name="B1"]/default:ConnectivityNode[@name="L1" and @pathName="TEMPLATE/V1/B1/L1"]',
					'//default:Bay[@name="BB"]/default:ConnectivityNode[@name="BB1" and @pathName="TEMPLATE/V1/BB/BB1"]',
					'//default:ConductingEquipment[@name="QB1"]/default:Terminal[@cNodeName="BB1" and @substationName="TEMPLATE" and @voltageLevelName="V1" and @bayName="BB"]',
				],
			},
		'a terminal on a node of another Bay → removed, the equipment stays': {
			sourceXml: connectivitySourceXml,
			targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
			expectedQueries: [
				'//default:ConductingEquipment[@name="QB1"]/default:Terminal[@cNodeName="L1"]',
			],
			unexpectedQueries: [
				'//default:Terminal[@cNodeName="BB1"]',
				'//default:ConnectivityNode[@name="BB1"]',
			],
		},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await ssd(tx, {
				sourceQuery: source.query,
				scopeRef: testCase.scope ?? scopeRef,
				tool: 'TEST',
				who: 'test',
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('extract.ssd - what it does not carry', () => {
	it('a source holding IEDs and a Communication section → one warning counting them', async () => {
		const withDevices = sourceXml.replace(
			`<DataTypeTemplates ${id}="dtt-1">`,
			// a fragment: the sections inserted before the data types, whose opening tag it ends with
			[
				`<Communication ${id}="comm-1"><SubNetwork name="W1" ${id}="subnet-1"/></Communication>`,
				`<IED name="P1" ${id}="ied-1"><AccessPoint name="AP1" ${id}="ap-1"/></IED>`,
				`<IED name="P2" ${id}="ied-2"><AccessPoint name="AP1" ${id}="ap-2"/></IED>`,
				`<DataTypeTemplates ${id}="dtt-1">`,
			].join(''),
		)
		const { source, target } = await createSclTestProject({
			sourceXml: withDevices,
			targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
		})
		if (!target) throw new Error('target required')

		const result = await target.document.transaction((tx) =>
			ssd(tx, { sourceQuery: source.document.query, scopeRef, tool: 'TEST', who: 'test' }),
		)

		expect(result.warnings).toEqual([
			{ code: 'sections-not-carried', counts: { IED: 2, Communication: 1 } },
		])
	})

	it('a source holding neither → no warning', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml,
			targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
		})
		if (!target) throw new Error('target required')

		const result = await target.document.transaction((tx) =>
			ssd(tx, { sourceQuery: source.document.query, scopeRef, tool: 'TEST', who: 'test' }),
		)

		expect(result.warnings).toEqual([])
	})
})
