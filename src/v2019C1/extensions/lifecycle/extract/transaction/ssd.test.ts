import { ssd } from './ssd'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
	runSclTestCases,
} from '@/v2019C1/test'

import type { ExtractWarning, SsdExtractScope, TemplateLink } from './extract.types'
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
	/**
	 * The warnings of the extract about the satellites it moved or numbered, `<code> <before> > <after>`, or did not place,
	 * `<code> <source id>`.
	 */
	satelliteWarnings?: string[]
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

/** Two applications of a bay compose one function: the extracted bay holds it once, both refer to it. */
const twoApplicationsXml = /* xml */ `
	<SCL ${ns} ${id}="scl-src">
		<Substation name="S1" ${id}="sub-1">
			<VoltageLevel name="V1" ${id}="vl-1">
				<Bay name="B1" ${id}="bay-1">
					<Private type="eIEC61850-6-100" ${id}="bay-priv">
						<eIEC61850-6-100:Application name="PROT_App" uuid="prot-app-uuid" ${id}="prot-app">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="prot-role">
								<eIEC61850-6-100:FunctionRoleContent ${id}="prot-content">
									<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Shared" functionUuid="shared-uuid" ${id}="prot-ref"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
						<eIEC61850-6-100:Application name="CTRL_App" uuid="ctrl-app-uuid" ${id}="ctrl-app">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="ctrl-role">
								<eIEC61850-6-100:FunctionRoleContent ${id}="ctrl-content">
									<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Shared" functionUuid="shared-uuid" ${id}="ctrl-ref"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
					</Private>
					<Function name="Shared" uuid="shared-uuid" ${id}="shared"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** The same bay, each application's role referring to the trip logic the shared function holds. */
const twoApplicationsLogicXml = twoApplicationsXml
	.replace(
		`<Function name="Shared" uuid="shared-uuid" ${id}="shared"/>`,
		[
			`<Function name="Shared" uuid="shared-uuid" ${id}="shared">`,
			`<Private type="eIEC61850-6-100" ${id}="shared-private">`,
			`<eIEC61850-6-100:BehaviorDescription name="TRIP_LOGIC" uuid="logic-uuid" ${id}="logic"/>`,
			`</Private>`,
			`</Function>`,
		].join(''),
	)
	.replaceAll(
		`</eIEC61850-6-100:FunctionRoleContent>`,
		`<eIEC61850-6-100:BehaviorDescriptionRef behaviorDescription="S1/V1/B1/Shared/TRIP_LOGIC" behaviorDescriptionUuid="logic-uuid"/></eIEC61850-6-100:FunctionRoleContent>`,
	)

describe('extract.ssd - a function two applications compose', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the bay extracted → the function once, both applications referring to it': {
			sourceXml: twoApplicationsXml,
			targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
			expectedQueries: [
				'//default:Bay[@name="B1"][count(default:Function[@name="Shared"])=1]',
				'//v2019C1:Application[@name="PROT_App"]//v2019C1:FunctionRef[@functionUuid=//default:Function[@name="Shared"]/@uuid]',
				'//v2019C1:Application[@name="CTRL_App"]//v2019C1:FunctionRef[@functionUuid=//default:Function[@name="Shared"]/@uuid]',
			],
		},
		"both roles referring to the function's trip logic → the logic once, both references naming it":
			{
				sourceXml: twoApplicationsLogicXml,
				targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
				expectedQueries: [
					'//default:Function[@name="Shared"][count(default:Private/v2019C1:BehaviorDescription)=1]',
					'//v2019C1:Application[@name="CTRL_App"]//v2019C1:BehaviorDescriptionRef[@behaviorDescriptionUuid=//v2019C1:BehaviorDescription[@name="TRIP_LOGIC"]/@uuid]',
				],
			},
	}

	runSclTestCases.withExport({ testCases, act: extractBay })
})

/** Extract the bay of the source. */
async function extractBay({
	source,
	target,
}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
	if (!target) throw new Error('target required')
	await target.transaction(async function extractTheBay(tx) {
		await ssd(tx, { sourceQuery: source.query, scopeRef, tool: 'TEST', who: 'test' })
	})
	return { assertOn: 'target' }
}

// A bay whose bay holds a variable applying to its function and a behaviour description of the function's logical node,
// whose breaker holds a variable applying to itself, beside a function placed from its own file; the substation holds a
// variable applying to the function, one applying to the function from its own file and one applying to another bay only;
// the function from its own file comes after the breaker and before the bay's function: two variables apply to it and
// to one of those.
const levelSatellitesXml = /* xml */ `
	<SCL ${ns} ${id}="scl-src">
		<Substation name="S1" ${id}="sub-1">
			<Private type="eIEC61850-6-100" ${id}="sub-priv">
				<eIEC61850-6-100:Variable name="VSUB" value="1" uuid="vsub-uuid" templateUuid="vsub-tmpl-uuid" ${id}="vsub">
					<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Prot" elementUuid="fn-src-uuid" ${id}="vsub-apply-to"/>
				</eIEC61850-6-100:Variable>
				<eIEC61850-6-100:Variable name="VLIB" value="6" uuid="vlib-uuid" templateUuid="vlib-tmpl-uuid" ${id}="vlib">
					<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Lib" elementUuid="lib-uuid" ${id}="vlib-apply-to"/>
				</eIEC61850-6-100:Variable>
				<eIEC61850-6-100:Variable name="VMIX" value="7" uuid="vmix-uuid" templateUuid="vmix-tmpl-uuid" ${id}="vmix">
					<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Lib" elementUuid="lib-uuid" ${id}="vmix-lib"/>
					<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Prot" elementUuid="fn-src-uuid" ${id}="vmix-prot"/>
				</eIEC61850-6-100:Variable>
				<eIEC61850-6-100:Variable name="VMIX2" value="8" uuid="vmix2-uuid" templateUuid="vmix2-tmpl-uuid" ${id}="vmix2">
					<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/QA1" elementUuid="qa1-uuid" ${id}="vmix2-qa1"/>
					<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Lib" elementUuid="lib-uuid" ${id}="vmix2-lib"/>
				</eIEC61850-6-100:Variable>
				<eIEC61850-6-100:Variable name="VOTHER" value="2" uuid="vother-uuid" ${id}="vother">
					<eIEC61850-6-100:VariableApplyTo element="S1/V1/B2" elementUuid="bay-2-uuid" ${id}="vother-apply-to"/>
				</eIEC61850-6-100:Variable>
			</Private>
			<VoltageLevel name="V1" ${id}="vl-1">
				<Bay name="B1" uuid="bay-1-uuid" templateUuid="bay-tmpl-uuid" ${id}="bay-1">
					<Private type="eIEC61850-6-100" ${id}="bay-priv">
						<eIEC61850-6-100:Variable name="PICKUP" value="3" uuid="pickup-uuid" templateUuid="pickup-tmpl-uuid" ${id}="pickup">
							<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Prot" elementUuid="fn-src-uuid" ${id}="pickup-apply-to"/>
						</eIEC61850-6-100:Variable>
						<eIEC61850-6-100:BehaviorDescription name="BD1" uuid="bd-uuid" templateUuid="bd-tmpl-uuid" ${id}="bd">
							<eIEC61850-6-100:InputVar varName="in1" dataName="S1/V1/B1/Prot/CSWI1" lnodeUuid="ln-src-uuid" doName="Pos" ${id}="bd-input"/>
						</eIEC61850-6-100:BehaviorDescription>
					</Private>
					<ConductingEquipment name="QA1" type="CBR" uuid="qa1-uuid" ${id}="qa1">
						<Private type="eIEC61850-6-100" ${id}="qa1-priv">
							<eIEC61850-6-100:Variable name="VQA1" value="4" uuid="vqa1-uuid" ${id}="vqa1">
								<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/QA1" elementUuid="qa1-uuid" ${id}="vqa1-apply-to"/>
							</eIEC61850-6-100:Variable>
						</Private>
					</ConductingEquipment>
					<Function name="Lib" uuid="lib-uuid" templateUuid="lib-tmpl-uuid" ${id}="lib-1">
						<Private type="eIEC61850-6-100" ${id}="lib-priv">
							<eIEC61850-6-100:FunctionSclRef ${id}="lib-file">
								<eIEC61850-6-100:SclFileReference fileName="Lib" fileType="FSD" ${id}="lib-file-ref"/>
							</eIEC61850-6-100:FunctionSclRef>
						</Private>
					</Function>
					<Function name="Prot" uuid="fn-src-uuid" templateUuid="fn-tmpl-uuid" ${id}="fn-1">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="ln-src-uuid" ${id}="lnode-1"/>
					</Function>
				</Bay>
				<Bay name="B2" uuid="bay-2-uuid" ${id}="bay-2"/>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt-1">
			<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-1">
				<DO name="Pos" type="DPC_Type" ${id}="do-1"/>
			</LNodeType>
			<DOType id="DPC_Type" cdc="DPC" ${id}="dot-1">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="dot-da-1"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>
`

// The same bay, its function composed by an application whose role refers to the behaviour description of the bay.
const roleReferenceXml = levelSatellitesXml.replace(
	`<Private type="eIEC61850-6-100" ${id}="bay-priv">`,
	[
		`<Private type="eIEC61850-6-100" ${id}="bay-priv">`,
		`<eIEC61850-6-100:Application name="P_App" uuid="app-uuid" ${id}="app-1">`,
		`<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="root-role">`,
		`<eIEC61850-6-100:FunctionRoleContent ${id}="root-content">`,
		`<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Prot" functionUuid="fn-src-uuid" ${id}="app-fref"/>`,
		`</eIEC61850-6-100:FunctionRoleContent>`,
		`</eIEC61850-6-100:FunctionRole>`,
		`<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" ${id}="engineering-role">`,
		`<eIEC61850-6-100:FunctionRoleContent ${id}="engineering-content">`,
		`<eIEC61850-6-100:BehaviorDescriptionRef behaviorDescription="S1/V1/B1/BD1" behaviorDescriptionUuid="bd-uuid" ${id}="bd-ref"/>`,
		`</eIEC61850-6-100:FunctionRoleContent>`,
		`</eIEC61850-6-100:FunctionRole>`,
		`</eIEC61850-6-100:Application>`,
	].join(''),
)

// A bay whose voltage level holds a variable applying to its function, and another voltage level, read first, one of
// that name applying to it too: both land on the voltage level the file holds.
const twoLevelsXml = /* xml */ `
	<SCL ${ns} ${id}="scl-src">
		<Substation name="S1" ${id}="sub-1">
			<VoltageLevel name="V2" ${id}="vl-2">
				<Private type="eIEC61850-6-100" ${id}="vl-2-priv">
					<eIEC61850-6-100:Variable name="VX" value="2" uuid="vx-2-uuid" ${id}="a-vx-2">
						<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Prot" elementUuid="fn-src-uuid" ${id}="a-vx-2-apply-to"/>
					</eIEC61850-6-100:Variable>
				</Private>
			</VoltageLevel>
			<VoltageLevel name="V1" ${id}="vl-1">
				<Private type="eIEC61850-6-100" ${id}="vl-1-priv">
					<eIEC61850-6-100:Variable name="VX" value="1" uuid="vx-1-uuid" ${id}="vx-1">
						<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Prot" elementUuid="fn-src-uuid" ${id}="vx-1-apply-to"/>
					</eIEC61850-6-100:Variable>
				</Private>
				<Bay name="B1" uuid="bay-1-uuid" ${id}="bay-1">
					<Function name="Prot" uuid="fn-src-uuid" ${id}="fn-1"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// The same, the role referring instead to a variable of the bay's name the other bay holds, applying to the bay's function.
const roleNamesakeXml = roleReferenceXml
	.replace(
		`<Bay name="B2" uuid="bay-2-uuid" ${id}="bay-2"/>`,
		[
			`<Bay name="B2" uuid="bay-2-uuid" ${id}="bay-2">`,
			`<Private type="eIEC61850-6-100" ${id}="bay-2-priv">`,
			`<eIEC61850-6-100:Variable name="PICKUP" value="9" uuid="pickup-2-uuid" ${id}="pickup-2">`,
			`<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Prot" elementUuid="fn-src-uuid" ${id}="pickup-2-apply-to"/>`,
			`</eIEC61850-6-100:Variable>`,
			`</Private>`,
			`</Bay>`,
		].join(''),
	)
	.replace(
		`<eIEC61850-6-100:BehaviorDescriptionRef behaviorDescription="S1/V1/B1/BD1" behaviorDescriptionUuid="bd-uuid" ${id}="bd-ref"/>`,
		`<eIEC61850-6-100:VariableRef variable="S1/V1/B2/PICKUP" variableUuid="pickup-2-uuid" ${id}="pickup-2-ref"/>`,
	)

// The same, the role referring instead to two variables of the other bay applying to the voltage level — one to that bay
// too: nothing that applies to the bay reaches them.
const roleLevelXml = roleReferenceXml
	.replace(
		`<VoltageLevel name="V1" ${id}="vl-1">`,
		`<VoltageLevel name="V1" uuid="vl-1-uuid" ${id}="vl-1">`,
	)
	.replace(
		`<Bay name="B2" uuid="bay-2-uuid" ${id}="bay-2"/>`,
		[
			`<Bay name="B2" uuid="bay-2-uuid" ${id}="bay-2">`,
			`<Private type="eIEC61850-6-100" ${id}="bay-2-priv">`,
			`<eIEC61850-6-100:Variable name="VVL" value="9" uuid="vvl-uuid" templateUuid="vvl-tmpl-uuid" ${id}="vvl">`,
			`<eIEC61850-6-100:VariableApplyTo element="S1/V1" elementUuid="vl-1-uuid" ${id}="vvl-apply-to"/>`,
			`</eIEC61850-6-100:Variable>`,
			`<eIEC61850-6-100:Variable name="VVL2" value="8" uuid="vvl-2-uuid" templateUuid="vvl-2-tmpl-uuid" ${id}="vvl-2">`,
			`<eIEC61850-6-100:VariableApplyTo element="S1/V1" elementUuid="vl-1-uuid" ${id}="vvl-2-apply-to-vl"/>`,
			`<eIEC61850-6-100:VariableApplyTo element="S1/V1/B2" elementUuid="bay-2-uuid" ${id}="vvl-2-apply-to-bay"/>`,
			`</eIEC61850-6-100:Variable>`,
			`</Private>`,
			`</Bay>`,
		].join(''),
	)
	.replace(
		`<eIEC61850-6-100:BehaviorDescriptionRef behaviorDescription="S1/V1/B1/BD1" behaviorDescriptionUuid="bd-uuid" ${id}="bd-ref"/>`,
		[
			`<eIEC61850-6-100:VariableRef variable="S1/V1/B2/VVL" variableUuid="vvl-uuid" ${id}="vvl-ref"/>`,
			`<eIEC61850-6-100:VariableRef variable="S1/V1/B2/VVL2" variableUuid="vvl-2-uuid" ${id}="vvl-2-ref"/>`,
		].join(''),
	)
const VVL = '//default:Bay[@name="B1"]/default:Private/v2019C1:Variable[@name="VVL"]'
const VVL2 = '//default:Bay[@name="B1"]/default:Private/v2019C1:Variable[@name="VVL2"]'

// The same, two applications of the bay whose roles refer to a variable of the bay applying to a function of the other
// bay only, the second's to another such variable too.
const roleAwayXml = roleReferenceXml
	.replace(
		`<Bay name="B2" uuid="bay-2-uuid" ${id}="bay-2"/>`,
		`<Bay name="B2" uuid="bay-2-uuid" ${id}="bay-2"><Function name="F2X" uuid="f2x-uuid" ${id}="f2x"/></Bay>`,
	)
	.replace(
		`<eIEC61850-6-100:BehaviorDescriptionRef behaviorDescription="S1/V1/B1/BD1" behaviorDescriptionUuid="bd-uuid" ${id}="bd-ref"/>`,
		`<eIEC61850-6-100:VariableRef variable="S1/V1/B1/VAWAY" variableUuid="vaway-uuid" ${id}="vaway-ref"/>`,
	)
	.replace(
		`</eIEC61850-6-100:Application>`,
		[
			`</eIEC61850-6-100:Application>`,
			`<eIEC61850-6-100:Application name="P_App2" uuid="app-2-uuid" ${id}="app-2">`,
			`<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="root-role-2">`,
			`<eIEC61850-6-100:FunctionRoleContent ${id}="root-content-2">`,
			`<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Prot" functionUuid="fn-src-uuid" ${id}="app-2-fref"/>`,
			`</eIEC61850-6-100:FunctionRoleContent>`,
			`</eIEC61850-6-100:FunctionRole>`,
			`<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" ${id}="engineering-role-2">`,
			`<eIEC61850-6-100:FunctionRoleContent ${id}="engineering-content-2">`,
			`<eIEC61850-6-100:VariableRef variable="S1/V1/B1/VAWAY" variableUuid="vaway-uuid" ${id}="vaway-ref-2"/>`,
			`<eIEC61850-6-100:VariableRef variable="S1/V1/B1/VAWAY2" variableUuid="vaway-2-uuid" ${id}="vaway-2-ref"/>`,
			`</eIEC61850-6-100:FunctionRoleContent>`,
			`</eIEC61850-6-100:FunctionRole>`,
			`</eIEC61850-6-100:Application>`,
			`<eIEC61850-6-100:Variable name="VAWAY" value="5" uuid="vaway-uuid" ${id}="vaway">`,
			`<eIEC61850-6-100:VariableApplyTo element="S1/V1/B2/F2X" elementUuid="f2x-uuid" ${id}="vaway-apply-to"/>`,
			`</eIEC61850-6-100:Variable>`,
			`<eIEC61850-6-100:Variable name="VAWAY2" value="6" uuid="vaway-2-uuid" ${id}="vaway-2">`,
			`<eIEC61850-6-100:VariableApplyTo element="S1/V1/B2/F2X" elementUuid="f2x-uuid" ${id}="vaway-2-apply-to"/>`,
			`</eIEC61850-6-100:Variable>`,
		].join(''),
	)

const PICKUP = '//default:Bay[@name="B1"]/default:Private/v2019C1:Variable[@name="PICKUP"]'
const BD1 = '//default:Bay[@name="B1"]/default:Private/v2019C1:BehaviorDescription[@name="BD1"]'
const VSUB = '//default:Substation/default:Private/v2019C1:Variable[@name="VSUB"]'
const PROT_UUID = '//default:Function[@name="Prot"]/@uuid'

/** What a level of the bay holds is the bay's; what applies to it from above travels with it. */
describe('extract.ssd - what the levels hold', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the bay extracted → its variable, its behaviour description and its breaker variable, the one above applying to its function; not the one applying to another bay':
			{
				sourceXml: levelSatellitesXml,
				targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
				expectedQueries: [
					`${PICKUP}[@templateUuid="pickup-tmpl-uuid"]/v2019C1:VariableApplyTo[@elementUuid=${PROT_UUID}]`,
					`${BD1}/v2019C1:InputVar[@lnodeUuid=//default:Function[@name="Prot"]/default:LNode/@uuid]`,
					'//default:ConductingEquipment[@name="QA1"]/default:Private/v2019C1:Variable[@name="VQA1"]/v2019C1:VariableApplyTo[@elementUuid=//default:ConductingEquipment[@name="QA1"]/@uuid]',
					`${VSUB}[@templateUuid="vsub-tmpl-uuid"]/v2019C1:VariableApplyTo[@elementUuid=${PROT_UUID}]`,
				],
				unexpectedQueries: ['//v2019C1:Variable[@name="VOTHER"]'],
			},
		"an application's role refers to the bay's behaviour description → extracted once, the role naming it":
			{
				sourceXml: roleReferenceXml,
				targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
				expectedQueries: [
					'//default:Bay[@name="B1"][count(.//v2019C1:BehaviorDescription)=1]',
					`//v2019C1:BehaviorDescriptionRef[@behaviorDescriptionUuid=${BD1}/@uuid]`,
				],
			},
		"an application's role refers to a variable of the other bay, of the name of the bay's own → the bay's keeps its name, the other numbered beside it, both told":
			{
				sourceXml: roleNamesakeXml,
				targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
				expectedQueries: [
					'//default:Bay[@name="B1"]/default:Private[v2019C1:Variable[@name="PICKUP"][@value="3"]][v2019C1:Variable[@name="PICKUP_1"][@value="9"]]',
					'//v2019C1:VariableRef[@variableUuid=//v2019C1:Variable[@name="PICKUP_1"]/@uuid]',
				],
				satelliteWarnings: ['satellite-moved Bay > Bay', 'satellite-renamed PICKUP > PICKUP_1'],
			},
		"an application's role refers to two variables of the other bay applying to the voltage level → in the bay, applying to the voltage level of the file only, their link kept":
			{
				sourceXml: roleLevelXml,
				targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
				expectedQueries: [
					`${VVL}[@templateUuid="vvl-tmpl-uuid"]/v2019C1:VariableApplyTo[@elementUuid=//default:VoltageLevel/@uuid]`,
					`${VVL2}[@templateUuid="vvl-2-tmpl-uuid"][count(v2019C1:VariableApplyTo)=1]/v2019C1:VariableApplyTo[@elementUuid=//default:VoltageLevel/@uuid]`,
				],
				satelliteWarnings: ['satellite-moved Bay > Bay', 'satellite-moved Bay > Bay'],
			},
		'two applications whose roles refer to a variable applying to a function of another bay only, one to a second such → neither placed, nor referred to, each told once':
			{
				sourceXml: roleAwayXml,
				targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
				expectedQueries: [
					'//v2019C1:Application[@name="P_App2"]',
					'//default:Bay[@name="B1"][not(.//v2019C1:VariableRef)]',
				],
				unexpectedQueries: [
					'//v2019C1:Variable[@name="VAWAY"]',
					'//v2019C1:Variable[@name="VAWAY2"]',
				],
				satelliteWarnings: ['satellite-not-placed vaway', 'satellite-not-placed vaway-2'],
			},
		"templateLink break: what an application's role refers to came with the bay's instance → it loses its link":
			{
				sourceXml: roleLevelXml,
				targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
				templateLink: 'break',
				expectedQueries: [`${VVL}[not(@templateUuid)]`, `${VVL2}[not(@templateUuid)]`],
				satelliteWarnings: ['satellite-moved Bay > Bay', 'satellite-moved Bay > Bay'],
			},
		'two variables of one name applying to the bay from two voltage levels → both on the voltage level extracted, the one moved there numbered and told':
			{
				sourceXml: twoLevelsXml,
				targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
				expectedQueries: [
					'//default:VoltageLevel/default:Private[v2019C1:Variable[@name="VX"][@value="1"]][v2019C1:Variable[@name="VX_1"][@value="2"]]',
				],
				satelliteWarnings: [
					'satellite-moved VoltageLevel > VoltageLevel',
					'satellite-renamed VX > VX_1',
				],
			},
		'templateLink break: what the levels hold and what applies to the bay lose their link': {
			sourceXml: levelSatellitesXml,
			targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
			templateLink: 'break',
			expectedQueries: [
				`${PICKUP}[not(@templateUuid)]`,
				`${BD1}[not(@templateUuid)]`,
				`${VSUB}[not(@templateUuid)]`,
				// what applies only to a function placed from its own file is that file's instance: it keeps its link
				'//v2019C1:Variable[@name="VLIB"][@templateUuid="vlib-tmpl-uuid"]',
				// one applying to the function from its own file and to the bay's came with the bay's instance too
				'//v2019C1:Variable[@name="VMIX"][not(@templateUuid)]',
				// whichever of its elements comes first or last
				'//v2019C1:Variable[@name="VMIX2"][not(@templateUuid)]',
			],
		},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const { warnings } = await target.transaction(async function extractBay(tx) {
			return ssd(tx, {
				sourceQuery: source.query,
				scopeRef,
				tool: 'TEST',
				who: 'test',
				...(testCase.templateLink ? { templateLink: testCase.templateLink } : {}),
			})
		})
		expect(describeSatelliteWarnings({ warnings }), 'extract').toEqual(
			testCase.satelliteWarnings ?? [],
		)
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

/** The warnings of an extract about the satellites it moved or numbered, `<code> <before> > <after>`, sorted. */
function describeSatelliteWarnings(params: { warnings: readonly ExtractWarning[] }): string[] {
	const described: string[] = []
	for (const warning of params.warnings) {
		if (warning.code === 'satellite-moved')
			described.push(`${warning.code} ${warning.from} > ${warning.to}`)
		if (warning.code === 'satellite-renamed')
			described.push(`${warning.code} ${warning.name} > ${warning.as}`)
		if (warning.code === 'satellite-not-placed')
			described.push(`${warning.code} ${warning.source.id}`)
	}
	return described.sort()
}
