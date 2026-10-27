import { reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffNode } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { SclTest } from '@/v2019C1/test'

// A placement onto an element the project shares (a role, a category) pours what it contributes into it, as the
// report lists it: one reference per element it places, none twice, nothing the project holds rewritten.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const protectionRef = { tagName: 'Function', id: 'protection-s' } as Scl.Ref<'Function'>
const firstBayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>
const secondBayRef = { tagName: 'Bay', id: 'bay-second-t' } as Scl.Ref<'Bay'>

/** Two applications of one file on one role PIU, each composing its own function. */
const applicationsXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:Application name="PROT_APP" type="Protection" uuid="protection-application-source" ${id}="protection-application-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="protection-role-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="protection-role-content-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="protection-source" ${id}="protection-application-ref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
					<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/TEMPLATE/PIU" allocationRoleUuid="role-source" ${id}="protection-role-ref-s"/>
				</eIEC61850-6-100:Application>
				<eIEC61850-6-100:Application name="CTRL_APP" type="Control" uuid="control-application-source" ${id}="control-application-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="control-role-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="control-role-content-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="control-source" ${id}="control-application-ref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
					<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/TEMPLATE/PIU" allocationRoleUuid="role-source" ${id}="control-role-ref-s"/>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-private-s">
						<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-source" ${id}="role-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="protection-source" ${id}="role-protection-ref-s"/>
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="control-source" ${id}="role-control-ref-s"/>
						</eIEC61850-6-100:AllocationRole>
					</Private>
					<Function name="Prot" uuid="protection-source" ${id}="protection-s"/>
					<Function name="Ctrl" uuid="control-source" ${id}="control-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A project whose bay holds a role PIU of its own. */
const projectWithRoleXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t">
					<Private type="eIEC61850-6-100" ${id}="bay-private-t">
						<eIEC61850-6-100:AllocationRole name="PIU" desc="project" uuid="role-project" ${id}="role-t"/>
					</Private>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A function library file whose category classifies its function. */
const functionXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:FunctionCategory name="PROTECTION" uuid="category-source" ${id}="category-s">
					<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="protection-source" ${id}="category-ref-s"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="protection-source" ${id}="protection-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A project of two bays, the first holding an instance of the function its category of that name classifies. */
const projectWithInstanceXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="private-t">
				<eIEC61850-6-100:FunctionCategory name="PROTECTION" desc="project" uuid="category-project" ${id}="category-t">
					<eIEC61850-6-100:FunctionCatRef function="S1/V1/B1/Prot" functionUuid="protection-first" ${id}="category-ref-t"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t">
					<Function name="Prot" uuid="protection-first" templateUuid="protection-source" ${id}="protection-first-t"/>
				</Bay>
				<Bay name="B2" ${id}="bay-second-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A bay template whose bay classifies its function in a category of its own. */
const bayXml = /* xml */ `
	<SCL ${ns} ${id}="ssd">
		<Header id="bay" uuid="bay-file-uuid" version="0" revision="1" ${id}="header-s"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="FEEDER" uuid="bay-source" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-private-s">
						<eIEC61850-6-100:FunctionCategory name="PROTECTION" uuid="category-source" ${id}="category-s">
							<eIEC61850-6-100:SubCategory name="DISTANCE" desc="template" uuid="sub-category-source" ${id}="sub-category-s"/>
							<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/FEEDER/Prot" functionUuid="protection-source" ${id}="category-ref-s"/>
						</eIEC61850-6-100:FunctionCategory>
					</Private>
					<ConductingEquipment name="QA1" type="CBR" uuid="breaker-source" ${id}="breaker-s">
						<Terminal name="T1" connectivityNode="TEMPLATE/TEMPLATE/FEEDER/CN1" substationName="TEMPLATE" voltageLevelName="TEMPLATE" bayName="FEEDER" cNodeName="CN1" cNodeUuid="node-source" ${id}="terminal-s"/>
					</ConductingEquipment>
					<ConnectivityNode name="CN1" desc="template" pathName="TEMPLATE/TEMPLATE/FEEDER/CN1" uuid="node-source" ${id}="node-s"/>
					<Function name="Prot" uuid="protection-source" ${id}="protection-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A project whose bay holds a category of that name of its own. */
const projectBayWithCategoryXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="project" uuid="project-file-uuid" ${id}="header-t"/>
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t">
					<Private type="eIEC61850-6-100" ${id}="bay-private-t">
						<eIEC61850-6-100:FunctionCategory name="PROTECTION" desc="project" uuid="category-project" ${id}="category-t"/>
					</Private>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A project whose bay classifies a function of its own in a category of that name. */
const projectBayClassifyingXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="project" uuid="project-file-uuid" ${id}="header-t"/>
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t">
					<Private type="eIEC61850-6-100" ${id}="bay-private-t">
						<eIEC61850-6-100:FunctionCategory name="PROTECTION" desc="project" uuid="category-project" ${id}="category-t">
							<eIEC61850-6-100:FunctionCatRef function="S1/V1/B1/Local" functionUuid="local-project" ${id}="category-ref-t"/>
						</eIEC61850-6-100:FunctionCategory>
					</Private>
					<ConductingEquipment name="QA1" type="CBR" uuid="breaker-project" ${id}="breaker-t">
						<Terminal name="T1" connectivityNode="S1/V1/B1/CN9" substationName="S1" voltageLevelName="V1" bayName="B1" cNodeName="CN9" ${id}="terminal-t"/>
					</ConductingEquipment>
					<ConnectivityNode name="CN9" pathName="S1/V1/B1/CN9" uuid="node-project" ${id}="node-t"/>
					<Function name="Local" uuid="local-project" ${id}="local-t"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A project where the bay template was placed, its category described by the project since. */
const projectBayPlacedXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="project" uuid="project-file-uuid" ${id}="header-t"/>
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="FEEDER" uuid="bay-project" templateUuid="bay-source" ${id}="bay-t">
					<Private type="eIEC61850-6-100" ${id}="bay-private-t">
						<eIEC61850-6-100:FunctionCategory name="PROTECTION" desc="project" uuid="category-project" templateUuid="category-source" ${id}="category-t">
							<eIEC61850-6-100:SubCategory name="DISTANCE" desc="project" uuid="sub-category-project" templateUuid="sub-category-source" ${id}="sub-category-t"/>
							<eIEC61850-6-100:FunctionCatRef function="S1/V1/FEEDER/Prot" functionUuid="protection-project" ${id}="category-ref-t"/>
						</eIEC61850-6-100:FunctionCategory>
					</Private>
					<ConnectivityNode name="CN1" desc="project" pathName="S1/V1/FEEDER/CN1" uuid="node-project" templateUuid="node-source" ${id}="node-t"/>
					<Function name="Prot" uuid="protection-project" templateUuid="protection-source" ${id}="protection-t"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const ROLE = '//v2019C1:AllocationRole[@name="PIU"]'
const CATEGORY = '//v2019C1:FunctionCategory[@name="PROTECTION"]'

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The placements made one after the other, each reported then applied. */
	placements: Omit<LifecycleTarget, 'sourceQuery'>[]
	/** What each report lists added into the shared element, by source record id, sorted. */
	listed: string[][]
	/** Where the consumer maps the template's elements, the same for every placement. */
	mappings?: DecisionMappings
}

describe('a placement pours what it contributes into the element the project shares', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'two applications of one file placed onto the project role → one allocation each, none twice': {
			sourceXml: applicationsXml,
			targetXml: projectWithRoleXml,
			placements: [
				{
					verb: 'asd',
					scenario: 'instantiate',
					ref: { tagName: 'Application', id: 'protection-application-s' } as Scl.Ref<'Application'>,
					anchor: firstBayRef,
				},
				{
					verb: 'asd',
					scenario: 'instantiate',
					ref: { tagName: 'Application', id: 'control-application-s' } as Scl.Ref<'Application'>,
					anchor: firstBayRef,
				},
			],
			listed: [['role-protection-ref-s'], ['role-control-ref-s']],
			expectedQueries: [
				`${ROLE}[@desc="project"][count(v2019C1:FunctionRef)=2]`,
				`${ROLE}/v2019C1:FunctionRef[@function="S1/V1/B1/Prot"]`,
				`${ROLE}/v2019C1:FunctionRef[@function="S1/V1/B1/Ctrl"]`,
			],
		},
		'a function placed by an update where it has no instance → its classification listed and written':
			{
				sourceXml: functionXml,
				targetXml: projectWithInstanceXml,
				placements: [
					{ verb: 'fsd', scenario: 'template', ref: protectionRef, anchor: secondBayRef },
				],
				listed: [['category-ref-s']],
				expectedQueries: [
					`${CATEGORY}[@desc="project"][count(v2019C1:FunctionCatRef)=2]`,
					`${CATEGORY}/v2019C1:FunctionCatRef[@function="S1/V1/B2/Prot"]`,
				],
			},
		'a bay template placed where the project holds a category of that name → the category classifies the bay function once, nothing rewritten':
			{
				sourceXml: bayXml,
				targetXml: projectBayWithCategoryXml,
				placements: [
					{
						verb: 'ssd',
						scenario: 'instantiate',
						ref: { tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>,
						anchor: { tagName: 'VoltageLevel', id: 'voltage-level-t' } as Scl.Ref<'VoltageLevel'>,
					},
				],
				listed: [['category-ref-s', 'terminal-s']],
				expectedQueries: [
					`${CATEGORY}[@desc="project"][count(v2019C1:FunctionCatRef)=1]`,
					`${CATEGORY}/v2019C1:FunctionCatRef[@function="S1/V1/FEEDER/Prot"]`,
				],
				unexpectedQueries: [`(${CATEGORY})[2]`],
			},
		"a bay template mapped onto the project's bay, whose category of that name classifies a function of its own → the category gains the bay function, what the bay holds of its own kept":
			{
				sourceXml: bayXml,
				targetXml: projectBayClassifyingXml,
				placements: [
					{
						verb: 'ssd',
						scenario: 'instantiate',
						ref: { tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>,
						anchor: { tagName: 'VoltageLevel', id: 'voltage-level-t' } as Scl.Ref<'VoltageLevel'>,
					},
				],
				mappings: new Map([['bay-s', { existing: firstBayRef }]]),
				listed: [['category-ref-s', 'terminal-s']],
				expectedQueries: [
					`${CATEGORY}[@desc="project"][count(v2019C1:FunctionCatRef)=2]`,
					`${CATEGORY}/v2019C1:FunctionCatRef[@function="S1/V1/B1/Local"]`,
					`${CATEGORY}/v2019C1:FunctionCatRef[@function="S1/V1/B1/Prot"]`,
					'//default:Bay[@name="B1"]/default:ConductingEquipment[@name="QA1"]/default:Terminal[@cNodeName="CN9"]',
				],
				unexpectedQueries: [`(${CATEGORY})[2]`],
			},
		'a bay template placed again onto the bay it was placed as, its category described by the project since → the category gains the new function, nothing it holds rewritten':
			{
				sourceXml: bayXml,
				targetXml: projectBayPlacedXml,
				placements: [
					{
						verb: 'ssd',
						scenario: 'instantiate',
						ref: { tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>,
						anchor: { tagName: 'VoltageLevel', id: 'voltage-level-t' } as Scl.Ref<'VoltageLevel'>,
					},
				],
				mappings: new Map([['bay-s', { existing: firstBayRef }]]),
				listed: [['category-ref-s', 'terminal-s']],
				expectedQueries: [
					`${CATEGORY}[@desc="project"][count(v2019C1:FunctionCatRef)=2]`,
					`${CATEGORY}/v2019C1:FunctionCatRef[@function="S1/V1/FEEDER/Prot"]`,
					'//default:Bay[@name="FEEDER"][count(default:ConnectivityNode)=1]/default:ConnectivityNode[@desc="project"]',
					`${CATEGORY}[count(v2019C1:SubCategory)=1]/v2019C1:SubCategory[@desc="project"]`,
				],
				unexpectedQueries: [`(${CATEGORY})[2]`],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const listed: string[][] = []
		for (const placement of testCase.placements) {
			const lifecycle = { ...placement, sourceQuery: source.query } as LifecycleTarget
			const { report } = await reportAndApply({
				document: target,
				lifecycle,
				mappings: testCase.mappings,
			})
			const added = new Set<string>()
			const changed: string[] = []
			for (const group of allGroups(report)) {
				for (const node of [group.primary, ...group.companions]) {
					collectAdded({ node, out: added })
					collectChanged({ node, out: changed })
				}
			}
			listed.push([...added].sort())
			expect(changed, 'report: nothing the project holds changed').toEqual([])
		}
		expect(listed, 'report').toEqual(testCase.listed)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** What a node changes or removes, as `<change> <tag>`, at any depth. */
function collectChanged(params: { node: DiffNode; out: string[] }): void {
	const { node, out } = params
	if (node.change === 'modified' || node.change === 'removed')
		out.push(`${node.change} ${node.tagName}`)
	for (const child of node.children) collectChanged({ node: child, out })
}

/** What a node adds into a shared element — a role's or a category's reference — or into a level: a terminal, at any depth. */
function collectAdded(params: { node: DiffNode; out: Set<string> }): void {
	const { node, out } = params
	const sourceId = node.sourceRef?.id ?? ''
	if (
		node.change === 'added' &&
		(sourceId.startsWith('role-') ||
			sourceId.startsWith('category-') ||
			sourceId.startsWith('terminal-'))
	) {
		out.add(sourceId)
	}
	for (const child of node.children) collectAdded({ node: child, out })
}
