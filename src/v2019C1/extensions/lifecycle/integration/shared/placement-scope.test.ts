import { reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type {
	DecisionMap,
	DiffNode,
	DiffReport,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

// A reference a placement writes into an element the project shares (a category, a variable) names only what the
// placement places: one naming another element of the file would name nothing in the project. The report lists what
// the apply writes.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const protectionRef = { tagName: 'Function', id: 'protection-s' } as Scl.Ref<'Function'>
const applicationRef = { tagName: 'Application', id: 'application-s' } as Scl.Ref<'Application'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

/** A category classifying both functions of the file, and a variable applying to both. */
const sharedPrivate = /* xml */ `
	<Private type="eIEC61850-6-100" ${id}="private-s">
		<eIEC61850-6-100:FunctionCategory name="PROTECTION" uuid="category-source" ${id}="category-s">
			<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="protection-source" ${id}="category-protection-ref-s"/>
			<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="control-source" ${id}="category-control-ref-s"/>
		</eIEC61850-6-100:FunctionCategory>
		<eIEC61850-6-100:Variable name="VSET" uuid="variable-source" ${id}="variable-s">
			<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="protection-source" ${id}="variable-protection-s"/>
			<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" elementUuid="control-source" ${id}="variable-control-s"/>
		</eIEC61850-6-100:Variable>
	</Private>
`

const functionsXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			${sharedPrivate}
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="protection-source" ${id}="protection-s"/>
					<Function name="Ctrl" uuid="control-source" ${id}="control-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** An application composing both functions, the category classifying both. */
const applicationXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-source" ${id}="application-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="protection-source" ${id}="application-protection-ref-s"/>
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="control-source" ${id}="application-control-ref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
				<eIEC61850-6-100:FunctionCategory name="PROTECTION" uuid="category-source" ${id}="category-s">
					<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="protection-source" ${id}="category-protection-ref-s"/>
					<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="control-source" ${id}="category-control-ref-s"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="protection-source" ${id}="protection-s"/>
					<Function name="Ctrl" uuid="control-source" ${id}="control-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** An application composing one function and standing on a role that also allocates the other function of the file. */
const roleXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-source" ${id}="application-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="protection-source" ${id}="application-protection-ref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
					<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/TEMPLATE/PIU" allocationRoleUuid="role-source" ${id}="role-ref-s"/>
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

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** The project with a category of the template's name of its own. */
const projectWithCategoryXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="private-t">
				<eIEC61850-6-100:FunctionCategory name="PROTECTION" uuid="category-project" ${id}="category-t"/>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const CATEGORY = '//v2019C1:FunctionCategory[@name="PROTECTION"]'
const VARIABLE = '//v2019C1:Variable[@name="VSET"]'
const ROLE = '//v2019C1:AllocationRole[@name="PIU"]'

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	lifecycle: Omit<LifecycleTarget, 'sourceQuery'>
	/** The source elements whose groups the consumer leaves out, by record id. */
	leftOut?: string[]
	/** The references the report lists added into the shared elements, by source record id, sorted. */
	listed: string[]
}

describe('a placement writes into a shared element only references to what it places', () => {
	const fsdPlacement = {
		verb: 'fsd',
		scenario: 'instantiate',
		ref: protectionRef,
		anchor: bayRef,
	} as const
	const testCases: SclTest.TestCases<TestCase> = {
		'a function placed whose category also classifies another function of the file → the category created names it alone':
			{
				sourceXml: functionsXml,
				targetXml: projectXml,
				lifecycle: fsdPlacement,
				listed: ['category-protection-ref-s', 'variable-protection-s'],
				expectedQueries: [
					`${CATEGORY}[count(v2019C1:FunctionCatRef)=1]`,
					`${CATEGORY}/v2019C1:FunctionCatRef[@function="S1/V1/B1/Prot"]`,
				],
			},
		'the same placed where the project has a category of that name → it gains the placed function alone':
			{
				sourceXml: functionsXml,
				targetXml: projectWithCategoryXml,
				lifecycle: fsdPlacement,
				listed: ['category-protection-ref-s', 'variable-protection-s'],
				expectedQueries: [
					`//default:Substation[count(.${CATEGORY})=1]`,
					`${CATEGORY}[@uuid="category-project"][count(v2019C1:FunctionCatRef)=1]`,
					`${CATEGORY}/v2019C1:FunctionCatRef[@function="S1/V1/B1/Prot"]`,
				],
			},
		'a variable applying to the placed function and another → the copy applies to the placed one alone':
			{
				sourceXml: functionsXml,
				targetXml: projectXml,
				lifecycle: fsdPlacement,
				listed: ['category-protection-ref-s', 'variable-protection-s'],
				expectedQueries: [
					`${VARIABLE}[count(v2019C1:VariableApplyTo)=1]`,
					`${VARIABLE}/v2019C1:VariableApplyTo[@element="S1/V1/B1/Prot"]`,
				],
			},
		'an application left out with one of its functions, the other placed → the category names the placed one alone':
			{
				sourceXml: applicationXml,
				targetXml: projectXml,
				lifecycle: { verb: 'asd', scenario: 'instantiate', ref: applicationRef, anchor: bayRef },
				leftOut: ['application-s', 'control-s'],
				listed: ['category-control-ref-s', 'category-protection-ref-s'],
				expectedQueries: [
					`${CATEGORY}[count(v2019C1:FunctionCatRef)=1]`,
					`${CATEGORY}/v2019C1:FunctionCatRef[@function="S1/V1/B1/Prot"]`,
					'//default:Bay[@name="B1"][not(default:Function[@name="Ctrl"])]',
				],
			},
		'an application placed whose role also allocates a function it does not compose → the role created allocates its own alone':
			{
				sourceXml: roleXml,
				targetXml: projectXml,
				lifecycle: { verb: 'asd', scenario: 'instantiate', ref: applicationRef, anchor: bayRef },
				listed: ['role-protection-ref-s'],
				expectedQueries: [
					`${ROLE}[count(v2019C1:FunctionRef)=1]`,
					`${ROLE}/v2019C1:FunctionRef[@function="S1/V1/B1/Prot"]`,
				],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = { ...testCase.lifecycle, sourceQuery: source.query } as LifecycleTarget
		const leftOut = new Set(testCase.leftOut ?? [])
		function decide(listed: DiffReport): DecisionMap {
			const decisions: DecisionMap = new Map()
			for (const group of allGroups(listed)) {
				if (leftOut.has(group.primary.sourceRef?.id ?? '')) decisions.set(group.id, 'skip')
			}
			return decisions
		}
		const { report } = await reportAndApply({ document: target, lifecycle, decide })

		const listed = new Set<string>()
		for (const group of allGroups(report)) {
			for (const node of [group.primary, ...group.companions])
				collectAddedReferences({ node, out: listed })
		}
		expect([...listed].sort(), 'report').toEqual(testCase.listed)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The references of the shared elements: a category's, a variable's, a role's. */
const SHARED_REFERENCE_TAGS = new Set(['FunctionCatRef', 'VariableApplyTo', 'FunctionRef'])

/** The references a node adds into a shared element (not the application's own), at any depth. */
function collectAddedReferences(params: { node: DiffNode; out: Set<string> }): void {
	const { node, out } = params
	const added = node.change === 'added' && node.sourceRef?.id
	if (
		added &&
		SHARED_REFERENCE_TAGS.has(node.tagName) &&
		!node.sourceRef?.id?.startsWith('application-')
	) {
		out.add(node.sourceRef?.id ?? '')
	}
	for (const child of node.children) collectAddedReferences({ node: child, out })
}
