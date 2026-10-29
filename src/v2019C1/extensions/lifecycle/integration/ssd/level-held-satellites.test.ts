import { describeSatellites, reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import {
	CROSS_CUTTING_SATELLITE_CONTAINERS,
	CROSS_CUTTING_SATELLITE_TAGS,
} from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites.constants'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type {
	DecisionMap,
	DiffNode,
	DiffReport,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

// A variable or a behaviour description a level of a substation template holds (its bay, an equipment of it) is the
// level's: placed with each instance of the unit, applying to what the instance places, listed once.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const projectVoltageLevel = {
	tagName: 'VoltageLevel',
	id: 'project-voltage-level',
} as Scl.Ref<'VoltageLevel'>

const onTheProjectBay: DecisionMappings = new Map([
	['bay-s', { existing: { tagName: 'Bay', id: 'project-bay' } }],
])

/** The tags whose elements belong to the level holding them, and their references. */
const SATELLITE_NODE_TAGS = new Set<string>([
	...CROSS_CUTTING_SATELLITE_CONTAINERS,
	'VariableApplyTo',
	'InputVar',
])

const dataTypeTemplates = /* xml */ `
	<DataTypeTemplates ${id}="templates-s">
		<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnode-type-s">
			<DO name="Pos" type="DPC_Type" ${id}="do-s"/>
		</LNodeType>
		<DOType id="DPC_Type" cdc="DPC" ${id}="do-type-s">
			<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-s"/>
		</DOType>
	</DataTypeTemplates>
`

// A bay template whose bay holds a variable applying to its function, one applying to itself and a behaviour
// description of the function's logical node; its breaker holds a variable applying to itself.
const bayTemplateXml = /* xml */ `
	<SCL ${ns} ${id}="ssd">
		<Header id="ssd" uuid="ssd-file-uuid" version="0" revision="1" ${id}="ssd-header"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="B1" uuid="bay-source-uuid" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-private-s">
						<eIEC61850-6-100:Variable name="PICKUP" value="1" uuid="pickup-source-uuid" ${id}="pickup-s">
							<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B1/Prot" elementUuid="prot-source-uuid" ${id}="pickup-apply-to-s"/>
						</eIEC61850-6-100:Variable>
						<eIEC61850-6-100:Variable name="VBAY" value="2" uuid="vbay-source-uuid" ${id}="vbay-s">
							<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B1" elementUuid="bay-source-uuid" ${id}="vbay-apply-to-s"/>
						</eIEC61850-6-100:Variable>
						<eIEC61850-6-100:BehaviorDescription name="BD1" uuid="behaviour-source-uuid" ${id}="behaviour-s">
							<eIEC61850-6-100:InputVar varName="in1" dataName="TEMPLATE/TEMPLATE/B1/Prot/CSWI1" lnodeUuid="lnode-source-uuid" doName="Pos" ${id}="input-s"/>
						</eIEC61850-6-100:BehaviorDescription>
					</Private>
					<ConductingEquipment name="QA1" type="CBR" uuid="breaker-source-uuid" ${id}="breaker-s">
						<Private type="eIEC61850-6-100" ${id}="breaker-private-s">
							<eIEC61850-6-100:Variable name="VQA1" value="3" uuid="vqa1-source-uuid" ${id}="vqa1-s">
								<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B1/QA1" elementUuid="breaker-source-uuid" ${id}="vqa1-apply-to-s"/>
							</eIEC61850-6-100:Variable>
						</Private>
					</ConductingEquipment>
					<Function name="Prot" uuid="prot-source-uuid" ${id}="prot-s">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-source-uuid" ${id}="lnode-s"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		${dataTypeTemplates}
	</SCL>
`

// The same bay, its variable applying to a second function too.
const twoFunctionsXml = bayTemplateXml
	.replace(
		`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B1/Prot" elementUuid="prot-source-uuid" ${id}="pickup-apply-to-s"/>`,
		`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B1/Prot" elementUuid="prot-source-uuid" ${id}="pickup-apply-to-s"/><eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B1/Ctl" elementUuid="ctl-source-uuid" ${id}="pickup-apply-to-ctl-s"/>`,
	)
	.replace('</Function>', `</Function><Function name="Ctl" uuid="ctl-source-uuid" ${id}="ctl-s"/>`)

// The same bay, its function composed by an application whose role refers to the behaviour description of the bay and
// to the variable of its breaker.
const roleReferenceXml = bayTemplateXml.replace(
	`<Private type="eIEC61850-6-100" ${id}="bay-private-s">`,
	[
		`<Private type="eIEC61850-6-100" ${id}="bay-private-s">`,
		`<eIEC61850-6-100:Application name="P_App" uuid="application-source-uuid" ${id}="application-s">`,
		`<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="root-role-s">`,
		`<eIEC61850-6-100:FunctionRoleContent ${id}="root-content-s">`,
		`<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B1/Prot" functionUuid="prot-source-uuid" ${id}="function-ref-s"/>`,
		`</eIEC61850-6-100:FunctionRoleContent>`,
		`</eIEC61850-6-100:FunctionRole>`,
		`<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" ${id}="engineering-role-s">`,
		`<eIEC61850-6-100:FunctionRoleContent ${id}="engineering-content-s">`,
		`<eIEC61850-6-100:BehaviorDescriptionRef behaviorDescription="TEMPLATE/TEMPLATE/B1/BD1" behaviorDescriptionUuid="behaviour-source-uuid" ${id}="behaviour-ref-s"/>`,
		`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/B1/QA1/VQA1" variableUuid="vqa1-source-uuid" ${id}="breaker-variable-ref-s"/>`,
		`</eIEC61850-6-100:FunctionRoleContent>`,
		`</eIEC61850-6-100:FunctionRole>`,
		`</eIEC61850-6-100:Application>`,
	].join(''),
)

// The same bay holding nothing but its function.
const functionOnlyXml = bayTemplateXml
	.replace(/<Private type="eIEC61850-6-100" [^>]*="bay-private-s">[\s\S]*?<\/Private>/, '')
	.replace(/<ConductingEquipment [\s\S]*?<\/ConductingEquipment>/, '')

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level"/>
		</Substation>
	</SCL>
`

// A project bay holding a variable and a breaker of the template's names, the variable applying to the bay.
const namesakesXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level">
				<Bay name="B1" uuid="project-bay-uuid" ${id}="project-bay">
					<Private type="eIEC61850-6-100" ${id}="project-bay-private">
						<eIEC61850-6-100:Variable name="VBAY" value="9" uuid="project-vbay-uuid" ${id}="project-vbay">
							<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1" elementUuid="project-bay-uuid" ${id}="project-vbay-apply-to"/>
						</eIEC61850-6-100:Variable>
					</Private>
					<ConductingEquipment name="QA1" type="CBR" uuid="project-breaker-uuid" ${id}="project-breaker"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** How many times the bay is placed under the voltage level. */
	placements: number
	/** The consumer places the bay on the project's bay. */
	onProjectBay?: true
	/** The consumer skips the function of the bay. */
	skipsFunction?: true
	expected: {
		/** Every variable and behaviour description of the project: `<tag> <name> @<level>: <what it applies to>`. */
		held: string[]
		/** What the last report lists of them and their references, as `<change> <tag>`, each node it lists. */
		listed: string[]
		/** The group each one added is listed in, as `listSatelliteGroups` writes it: one without a group rides its own. */
		groups: string[]
	}
}

describe('lifecycle — what a level of a substation template holds travels with the unit', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the bay placed → its variables, its behaviour description and its breaker variable, each listed once':
			{
				sourceXml: bayTemplateXml,
				targetXml: projectXml,
				placements: 1,
				expected: {
					groups: [
						'BehaviorDescription BD1 with Function Prot',
						'Variable PICKUP with Function Prot',
						'Variable VBAY with Bay B1',
						'Variable VQA1 with Bay B1',
					],
					held: [
						'BehaviorDescription BD1 @B1: B1/Prot/CSWI1',
						'Variable PICKUP @B1: B1/Prot',
						'Variable VBAY @B1: B1',
						'Variable VQA1 @QA1: B1/QA1',
					],
					listed: [
						'added BehaviorDescription',
						'added InputVar',
						'added Variable',
						'added Variable',
						'added Variable',
						'added VariableApplyTo',
						'added VariableApplyTo',
						'added VariableApplyTo',
					],
				},
			},
		'the bay placed twice → each instance holds its own': {
			sourceXml: bayTemplateXml,
			targetXml: projectXml,
			placements: 2,
			expected: {
				groups: [
					'BehaviorDescription BD1 with Function Prot',
					'Variable PICKUP with Function Prot',
					'Variable VBAY with Bay B1',
					'Variable VQA1 with Bay B1',
				],
				held: [
					'BehaviorDescription BD1 @B1: B1/Prot/CSWI1',
					'BehaviorDescription BD1 @B1_1: B1_1/Prot/CSWI1',
					'Variable PICKUP @B1: B1/Prot',
					'Variable PICKUP @B1_1: B1_1/Prot',
					'Variable VBAY @B1: B1',
					'Variable VBAY @B1_1: B1_1',
					'Variable VQA1 @QA1: B1/QA1',
					'Variable VQA1 @QA1: B1_1/QA1',
				],
				listed: [
					'added BehaviorDescription',
					'added InputVar',
					'added Variable',
					'added Variable',
					'added Variable',
					'added VariableApplyTo',
					'added VariableApplyTo',
					'added VariableApplyTo',
				],
			},
		},
		'its variable applying to two functions of the bay → placed once, listed once, applying to both':
			{
				sourceXml: twoFunctionsXml,
				targetXml: projectXml,
				placements: 1,
				expected: {
					groups: [
						'BehaviorDescription BD1 with Function Prot',
						'Variable PICKUP with Function Ctl',
						'Variable VBAY with Bay B1',
						'Variable VQA1 with Bay B1',
					],
					held: [
						'BehaviorDescription BD1 @B1: B1/Prot/CSWI1',
						'Variable PICKUP @B1: B1/Ctl, B1/Prot',
						'Variable VBAY @B1: B1',
						'Variable VQA1 @QA1: B1/QA1',
					],
					listed: [
						'added BehaviorDescription',
						'added InputVar',
						'added Variable',
						'added Variable',
						'added Variable',
						'added VariableApplyTo',
						'added VariableApplyTo',
						'added VariableApplyTo',
						'added VariableApplyTo',
					],
				},
			},
		"an application's role refers to the bay's behaviour description and the breaker's variable → each placed once, where it is held, listed once":
			{
				sourceXml: roleReferenceXml,
				targetXml: projectXml,
				placements: 1,
				expected: {
					groups: [
						'BehaviorDescription BD1 with Function Prot',
						'Variable PICKUP with Function Prot',
						'Variable VBAY with Bay B1',
						'Variable VQA1 with Bay B1',
					],
					held: [
						'BehaviorDescription BD1 @B1: B1/Prot/CSWI1',
						'Variable PICKUP @B1: B1/Prot',
						'Variable VBAY @B1: B1',
						'Variable VQA1 @QA1: B1/QA1',
					],
					listed: [
						'added BehaviorDescription',
						'added InputVar',
						'added Variable',
						'added Variable',
						'added Variable',
						'added VariableApplyTo',
						'added VariableApplyTo',
						'added VariableApplyTo',
					],
				},
			},
		'the function of the bay skipped → what applies to it alone is not placed, the rest is': {
			sourceXml: bayTemplateXml,
			targetXml: projectXml,
			placements: 1,
			skipsFunction: true,
			expected: {
				groups: [
					'BehaviorDescription BD1 with Function Prot',
					'Variable PICKUP with Function Prot',
					'Variable VBAY with Bay B1',
					'Variable VQA1 with Bay B1',
				],
				held: ['Variable VBAY @B1: B1', 'Variable VQA1 @QA1: B1/QA1'],
				listed: [
					'added BehaviorDescription',
					'added InputVar',
					'added Variable',
					'added Variable',
					'added Variable',
					'added VariableApplyTo',
					'added VariableApplyTo',
					'added VariableApplyTo',
				],
			},
		},
		'the bay holding nothing but its function placed on a project bay → nothing listed, the project bay up to date':
			{
				sourceXml: functionOnlyXml,
				targetXml: namesakesXml,
				placements: 1,
				onProjectBay: true,
				expected: {
					groups: [],
					held: ['Variable VBAY @B1: B1'],
					listed: [],
				},
			},
		'the bay placed on a project bay holding a variable and a breaker of those names → the bay gets its own, numbered beside the project one':
			{
				sourceXml: bayTemplateXml,
				targetXml: namesakesXml,
				placements: 1,
				onProjectBay: true,
				expected: {
					groups: [
						'BehaviorDescription BD1 with Function Prot',
						'Variable PICKUP with Function Prot',
						'Variable VBAY with Variable VBAY',
						'Variable VQA1 with Variable VQA1',
					],
					held: [
						'BehaviorDescription BD1 @B1: B1/Prot/CSWI1',
						'Variable PICKUP @B1: B1/Prot',
						'Variable VBAY @B1: B1',
						'Variable VBAY_1 @B1: B1',
						'Variable VQA1 @QA1: B1/QA1',
					],
					listed: [
						'added BehaviorDescription',
						'added InputVar',
						'added Variable',
						'added Variable',
						'added Variable',
						'added VariableApplyTo',
						'added VariableApplyTo',
						'added VariableApplyTo',
					],
				},
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const bay = { tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>
		let lastReport: DiffReport | undefined
		for (let placement = 0; placement < testCase.placements; placement++) {
			const placed = await reportAndApply({
				document: target,
				lifecycle: {
					verb: 'ssd',
					scenario: 'instantiate',
					sourceQuery: source.query,
					ref: bay,
					anchor: projectVoltageLevel,
				},
				mappings: testCase.onProjectBay ? onTheProjectBay : undefined,
				decide: testCase.skipsFunction ? skipFunction : undefined,
			})
			lastReport = placed.report
		}
		if (!lastReport) throw new Error('a case places the bay at least once')

		expect(listSatelliteNodes(lastReport), 'report').toEqual(testCase.expected.listed)
		expect(
			await listSatelliteGroups({ report: lastReport, sourceQuery: source.query }),
			'report',
		).toEqual(testCase.expected.groups)
		// an instance with nothing to decide is up to date, one with something is not
		expect(
			lastReport.instances.map((instance) => instance.upToDate === (instance.groups.length === 0)),
			'report',
		).not.toContain(false)
		const held = await describeSatellites(target.query)
		expect(held, 'apply').toEqual(testCase.expected.held)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** The consumer skips every function group of a report. */
function skipFunction(listed: DiffReport): DecisionMap {
	return new Map(
		allGroups(listed)
			.filter((group) => group.primary.tagName === 'Function')
			.map((group) => [group.id, 'skip'] as const),
	)
}

/** The satellite nodes of a report's groups and their references, as `<change> <tag>`, one entry per node. */
function listSatelliteNodes(lifecycleReport: DiffReport): string[] {
	const nodes = new Set<DiffNode>()
	function visit(node: DiffNode): void {
		nodes.add(node)
		for (const child of node.children) visit(child)
	}
	for (const group of allGroups(lifecycleReport)) {
		for (const node of [group.primary, ...group.companions]) visit(node)
	}
	const listed: string[] = []
	for (const node of nodes) {
		if (node.change !== 'unchanged' && SATELLITE_NODE_TAGS.has(node.tagName)) {
			listed.push(`${node.change} ${node.tagName}`)
		}
	}
	return listed.sort()
}

/**
 * The group each satellite added is listed in: `<tag> <name> with <primary tag> <primary name>`, sorted — the first
 * primary it applies to, else the frame.
 */
async function listSatelliteGroups(params: {
	report: DiffReport
	sourceQuery: Core.Query<Config>
}): Promise<string[]> {
	const { report, sourceQuery } = params
	async function nameOf(node: DiffNode): Promise<string> {
		if (!node.sourceRef) return ''
		return (await sourceQuery.any.getAttribute(node.sourceRef, { name: 'name' })) ?? ''
	}
	const listed: string[] = []
	for (const group of allGroups(report)) {
		const satellites = new Set<DiffNode>()
		function visit(node: DiffNode): void {
			if (CROSS_CUTTING_SATELLITE_TAGS.has(node.tagName)) satellites.add(node)
			for (const child of node.children) visit(child)
		}
		for (const node of [group.primary, ...group.companions]) visit(node)
		const primary = `${group.primary.tagName} ${await nameOf(group.primary)}`
		for (const node of satellites) {
			if (node.change === 'added')
				listed.push(`${node.tagName} ${await nameOf(node)} with ${primary}`)
		}
	}
	return listed.sort()
}
