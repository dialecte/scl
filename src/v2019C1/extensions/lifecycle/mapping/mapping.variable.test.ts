import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { collectReferenceViolations } from '@/v2019C1/test/assert-coherent-scl-references'

import type { DecisionMapping, MappingReason } from './mapping.types'
import type { Scl } from '@/v2019C1/config'
import type { DiffNode } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'function-s' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>
const projectVariableRef = { tagName: 'Variable', id: 'variable-t' } as Scl.Ref<'Variable'>

/** Stands, in an expected mapping, for the variable the instantiate created. */
const createdVariableRef = { tagName: 'Variable', id: '<created>' } as Scl.Ref<'Variable'>

// A function the variable "VXCBR" applies to.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:Variable name="VXCBR" uuid="variable-source-uuid" ${id}="variable-s">
					<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="function-source-uuid" ${id}="variable-apply-to-s"/>
				</eIEC61850-6-100:Variable>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A project whose variable "VXCBR" has its own description and already applies to a function.
const projectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="private-t">
				<eIEC61850-6-100:Variable name="VXCBR" desc="Project breaker variable" uuid="variable-project-uuid" ${id}="variable-t">
					<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Local" elementUuid="local-function-uuid" ${id}="variable-apply-to-t"/>
				</eIEC61850-6-100:Variable>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t">
					<Function name="Local" uuid="local-function-uuid" ${id}="local-function-t"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A project holding a variable "VXCBR" at two levels.
const projectWithTwoVariablesXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="private-t">
				<eIEC61850-6-100:Variable name="VXCBR" uuid="variable-project-uuid" ${id}="variable-t">
					<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Local" elementUuid="local-function-uuid" ${id}="variable-apply-to-t"/>
				</eIEC61850-6-100:Variable>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Private type="eIEC61850-6-100" ${id}="voltage-level-private-t">
					<eIEC61850-6-100:Variable name="VXCBR" uuid="variable-project-uuid-2" ${id}="variable-t-2">
						<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Local" elementUuid="local-function-uuid" ${id}="variable-apply-to-t-2"/>
					</eIEC61850-6-100:Variable>
				</Private>
				<Bay name="B1" ${id}="bay-t">
					<Function name="Local" uuid="local-function-uuid" ${id}="local-function-t"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A project with no variable.
const projectWithoutVariableXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The consumer's choices at the instantiate, by source record id. */
	chosen?: [string, DecisionMapping][]
	/** A fragment of the refusal when the report rejects the choices; nothing else is then checked. */
	expectedRejection?: string
	/**
	 * After the instantiate, the instance is updated: `revised` — the template's function was revised
	 * and the consumer accepts everything; `unchanged` — nothing changed, the report asks for no
	 * decision and is applied as is.
	 */
	thenUpdate?: 'revised' | 'unchanged'
	expected?: {
		/** Where the last report (the update's when there is one) says the source variable lands. */
		mapping: DecisionMapping
		reason: MappingReason
		ambiguous: boolean
		locked: boolean
		/** How many variables and how many of their applications that report announces as new. */
		announcedNew: { Variable: number; VariableApplyTo: number }
		/** Names of every Variable of the project in the end. */
		variableNames: string[]
		/** What every variable of the project applies to in the end: `variable -> function`. */
		applications: string[]
		/** The description of the project's own variable in the end — left out when the project has none. */
		projectVariableDescription?: string
	}
}

/** A report node and every node below it. */
function flattenNodes(node: DiffNode): DiffNode[] {
	return [node, ...node.children.flatMap(flattenNodes)]
}

describe('shared-element mapping — a variable applying to a function', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'one variable of that name in the project → report and apply both map onto it, and it keeps what it had':
			{
				sourceXml,
				targetXml: projectXml,
				expected: {
					mapping: { existing: projectVariableRef },
					reason: 'name',
					ambiguous: false,
					locked: false,
					announcedNew: { Variable: 0, VariableApplyTo: 1 },
					variableNames: ['VXCBR'],
					applications: ['VXCBR -> Local', 'VXCBR -> Prot'],
					projectVariableDescription: 'Project breaker variable',
				},
			},
		'no variable of that name in the project → report and apply both create it': {
			sourceXml,
			targetXml: projectWithoutVariableXml,
			expected: {
				mapping: { create: { name: 'VXCBR' } },
				reason: 'none',
				ambiguous: false,
				locked: false,
				announcedNew: { Variable: 1, VariableApplyTo: 1 },
				variableNames: ['VXCBR'],
				applications: ['VXCBR -> Prot'],
			},
		},
		'two variables of that name in the project → neither is picked, the report asks for its name, apply creates it under a free one':
			{
				sourceXml,
				targetXml: projectWithTwoVariablesXml,
				expected: {
					mapping: { create: { name: 'VXCBR' } },
					reason: 'name',
					ambiguous: true,
					locked: false,
					announcedNew: { Variable: 1, VariableApplyTo: 1 },
					variableNames: ['VXCBR', 'VXCBR', 'VXCBR_1'],
					applications: ['VXCBR -> Local', 'VXCBR -> Local', 'VXCBR_1 -> Prot'],
				},
			},
		'the consumer sends a choice for the variable → refused, where a variable lands is not chosen':
			{
				sourceXml,
				targetXml: projectXml,
				chosen: [['variable-s', { create: {} }]],
				expectedRejection: 'cannot be chosen',
			},
		'the variable was mapped onto a project variable → an update lists it as mapped there, locked, and leaves it as it is':
			{
				sourceXml,
				targetXml: projectXml,
				thenUpdate: 'revised',
				expected: {
					mapping: { existing: projectVariableRef },
					reason: 'lineage',
					ambiguous: false,
					locked: true,
					announcedNew: { Variable: 0, VariableApplyTo: 0 },
					variableNames: ['VXCBR'],
					applications: ['VXCBR -> Local', 'VXCBR -> Prot'],
					projectVariableDescription: 'Project breaker variable',
				},
			},
		'the variable was created by the instantiate → an update finds it by its lineage, nothing is duplicated':
			{
				sourceXml,
				targetXml: projectWithoutVariableXml,
				thenUpdate: 'revised',
				expected: {
					mapping: { existing: createdVariableRef },
					reason: 'lineage',
					ambiguous: false,
					locked: true,
					announcedNew: { Variable: 0, VariableApplyTo: 0 },
					variableNames: ['VXCBR'],
					applications: ['VXCBR -> Prot'],
				},
			},
		'the variable was mapped onto a project variable, nothing changed since, the update is applied without decisions → still one variable, as it was':
			{
				sourceXml,
				targetXml: projectXml,
				thenUpdate: 'unchanged',
				expected: {
					mapping: { existing: projectVariableRef },
					reason: 'lineage',
					ambiguous: false,
					locked: true,
					announcedNew: { Variable: 0, VariableApplyTo: 0 },
					variableNames: ['VXCBR'],
					applications: ['VXCBR -> Local', 'VXCBR -> Prot'],
					projectVariableDescription: 'Project breaker variable',
				},
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		const lifecycleTarget = {
			verb: 'fsd' as const,
			sourceQuery: source.query,
			ref: functionRef,
			anchor: bayRef,
		}
		const decisionMappings = new Map(testCase.chosen ?? [])

		const variablesAtStart = await target.query.getRecordsByTagName('Variable')
		const variableIdsAtStart = new Set(variablesAtStart.map((variable) => variable.id))

		if (testCase.expectedRejection) {
			const refused = report(target.query, {
				...lifecycleTarget,
				scenario: 'instantiate',
				resolution: { mappings: decisionMappings },
			})
			await expect(refused).rejects.toThrow(testCase.expectedRejection)
			return
		}
		const expected = testCase.expected
		if (!expected) throw new Error('expected required')

		// 1. the instantiate
		let lastReport = await report(target.query, { ...lifecycleTarget, scenario: 'instantiate' })
		await target.transaction(async (tx) => {
			await apply(tx, {
				...lifecycleTarget,
				scenario: 'instantiate',
				report: lastReport,
				resolution: { decisions: new Map() },
			})
		})

		// 2. the template's function is revised and the instance updated
		if (testCase.thenUpdate) {
			if (testCase.thenUpdate === 'revised') {
				await source.transaction(async (tx) => {
					await tx.update(functionRef, { attributes: { desc: 'revision 2' } })
				})
			}
			lastReport = await report(target.query, lifecycleTarget)
			const updateReport = lastReport
			const resolution = testCase.thenUpdate === 'revised' ? { decisions: new Map() } : undefined
			await target.transaction(async (tx) => {
				await apply(tx, { ...lifecycleTarget, report: updateReport, resolution })
			})
		}

		const variableMapping = lastReport.mappings.find((mapping) => mapping.id === 'variable-s')
		const reportedMapping = variableMapping?.mapping
		const namedMapping =
			reportedMapping && 'existing' in reportedMapping
				? {
						existing: variableIdsAtStart.has(reportedMapping.existing.id ?? '')
							? reportedMapping.existing
							: createdVariableRef,
					}
				: reportedMapping
		expect(namedMapping, 'report').toEqual(expected.mapping)
		expect(variableMapping?.reason, 'report').toBe(expected.reason)
		expect(variableMapping?.ambiguous, 'report').toBe(expected.ambiguous)
		expect(variableMapping?.locked, 'report').toBe(expected.locked)
		// where a variable lands is not the consumer's to choose
		expect(variableMapping?.selectable, 'report').toBe(false)

		// a node may be reached through its own group and through its parent's: count it once
		const announced = [
			...new Set(
				allGroups(lastReport).flatMap((group) =>
					[group.primary, ...group.companions].flatMap(flattenNodes),
				),
			),
		]
		const countNew = (tagName: string): number =>
			announced.filter((node) => node.tagName === tagName && node.change === 'added').length
		expect(
			{ Variable: countNew('Variable'), VariableApplyTo: countNew('VariableApplyTo') },
			'report',
		).toEqual(expected.announcedNew)

		const variables = await target.query.getRecordsByTagName('Variable')
		const variableNames: string[] = []
		for (const variable of variables) {
			const name = await target.query.getAttribute(variable, { name: 'name' })
			variableNames.push(name ?? '')
		}
		expect(variableNames.sort(), 'apply').toEqual(expected.variableNames)

		// read by uuid, not by the written path
		const functions = await target.query.getRecordsByTagName('Function')
		const functionNameByUuid = new Map<string, string>()
		for (const functionRecord of functions) {
			const { uuid, name } = await target.query.getAttributes(functionRecord)
			if (uuid) functionNameByUuid.set(uuid, name ?? '')
		}
		const applyTos = await target.query.getRecordsByTagName('VariableApplyTo')
		const applications: string[] = []
		for (const applyTo of applyTos) {
			const elementUuid = await target.query.getAttribute(applyTo, { name: 'elementUuid' })
			const variableName = applyTo.parent
				? await target.query.any.getAttribute(applyTo.parent, { name: 'name' })
				: undefined
			applications.push(
				`${variableName} -> ${functionNameByUuid.get(elementUuid ?? '') ?? `nothing (${elementUuid})`}`,
			)
		}
		expect(applications.sort(), 'apply').toEqual(expected.applications)

		if (expected.projectVariableDescription) {
			const description = await target.query.getAttribute(projectVariableRef, { name: 'desc' })
			expect(description, 'apply').toBe(expected.projectVariableDescription)
		}

		const appliedXml = (await target.query.getSnapshot({ as: 'xml' })) as string
		expect(collectReferenceViolations({ xml: appliedXml }), 'apply').toEqual([])
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// A function whose logical node is documented by the behaviour description "BD1".
const behaviourSourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:BehaviorDescription name="BD1" uuid="behaviour-source-uuid" ${id}="behaviour-s">
					<eIEC61850-6-100:InputVar dataName="TEMPLATE/Prot/CSWI1" lnodeUuid="lnode-source-uuid" doName="Pos" ${id}="input-s"/>
				</eIEC61850-6-100:BehaviorDescription>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-source-uuid" ${id}="lnode-s"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="templates-s">
			<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnode-type-s">
				<DO name="Pos" type="DPC_Type" ${id}="do-s"/>
			</LNodeType>
			<DOType id="DPC_Type" cdc="DPC" ${id}="do-type-s">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-s"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>
`

// A project whose behaviour description "BD1" has its own description and documents a logical node.
const behaviourProjectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="private-t">
				<eIEC61850-6-100:BehaviorDescription name="BD1" desc="Project behaviour" uuid="behaviour-project-uuid" ${id}="behaviour-t">
					<eIEC61850-6-100:InputVar dataName="S1/V1/B1/Local/CSWI1" lnodeUuid="local-lnode-uuid" doName="Pos" ${id}="input-t"/>
				</eIEC61850-6-100:BehaviorDescription>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t">
					<Function name="Local" uuid="local-function-uuid" ${id}="local-function-t">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="local-lnode-uuid" ${id}="local-lnode-t"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="templates-t">
			<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnode-type-t">
				<DO name="Pos" type="DPC_Type" ${id}="do-t"/>
			</LNodeType>
			<DOType id="DPC_Type" cdc="DPC" ${id}="do-type-t">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-t"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>
`

const projectBehaviourRef = {
	tagName: 'BehaviorDescription',
	id: 'behaviour-t',
} as Scl.Ref<'BehaviorDescription'>

type BehaviourTestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	expected: {
		/** Where the report says the source behaviour description lands. */
		mapping: DecisionMapping
		/** Names of every BehaviorDescription of the project, once applied. */
		behaviourNames: string[]
		/** The functions whose logical node the project's own description documents, once applied. */
		documents: string[]
	}
}

describe('shared-element mapping — a behaviour description documenting a logical node', () => {
	const testCases: SclTest.TestCases<BehaviourTestCase> = {
		'one behaviour description of that name in the project → report and apply both map onto it, and it keeps what it had':
			{
				sourceXml: behaviourSourceXml,
				targetXml: behaviourProjectXml,
				expected: {
					mapping: { existing: projectBehaviourRef },
					behaviourNames: ['BD1'],
					documents: ['Local', 'Prot'],
				},
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<BehaviourTestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		const lifecycleTarget = {
			verb: 'fsd' as const,
			scenario: 'instantiate' as const,
			sourceQuery: source.query,
			ref: functionRef,
			anchor: bayRef,
		}

		const reported = await report(target.query, lifecycleTarget)
		const behaviourMapping = reported.mappings.find((mapping) => mapping.id === 'behaviour-s')
		expect(behaviourMapping?.mapping, 'report').toEqual(testCase.expected.mapping)
		expect(behaviourMapping?.selectable, 'report').toBe(false)

		await target.transaction(async (tx) => {
			await apply(tx, { ...lifecycleTarget, report: reported })
		})

		const behaviours = await target.query.getRecordsByTagName('BehaviorDescription')
		const behaviourNames: string[] = []
		for (const behaviour of behaviours) {
			const name = await target.query.getAttribute(behaviour, { name: 'name' })
			behaviourNames.push(name ?? '')
		}
		expect(behaviourNames.sort(), 'apply').toEqual(testCase.expected.behaviourNames)

		const description = await target.query.getAttribute(projectBehaviourRef, { name: 'desc' })
		expect(description, 'apply').toBe('Project behaviour')

		// read by uuid, not by the written path
		const { InputVar: inputs = [] } = await target.query.findDescendants(projectBehaviourRef, {
			collect: 'InputVar',
		})
		const documents: string[] = []
		for (const input of inputs) {
			const lnodeUuid = await target.query.getAttribute(input, { name: 'lnodeUuid' })
			const [logicalNode] = await target.query.findByAttributes({
				tagName: 'LNode',
				attributes: { uuid: lnodeUuid },
			})
			const functionName = logicalNode?.parent
				? await target.query.any.getAttribute(logicalNode.parent, { name: 'name' })
				: `nothing (${lnodeUuid})`
			documents.push(functionName ?? '')
		}
		expect(documents.sort(), 'apply').toEqual(testCase.expected.documents)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
