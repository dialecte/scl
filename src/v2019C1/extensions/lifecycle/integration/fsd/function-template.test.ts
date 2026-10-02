import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { buildElementPath } from '@/v2019C1/extensions/reference/query/build'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { collectReferenceViolations } from '@/v2019C1/test/assert-coherent-scl-references'
import { assertValidSclXml } from '@/v2019C1/test/assert-valid-scl-xml'

import type { Scl } from '@/v2019C1/config'
import type { DiffNode } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionTemplateRef = {
	tagName: 'FunctionTemplate',
	id: 'function-s',
} as Scl.Ref<'FunctionTemplate'>
const substationRef = { tagName: 'Substation', id: 'substation-t' } as Scl.Ref<'Substation'>
const voltageLevelRef = {
	tagName: 'VoltageLevel',
	id: 'voltage-level-t',
} as Scl.Ref<'VoltageLevel'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>
const localFunctionRef = { tagName: 'Function', id: 'local-function-t' } as Scl.Ref<'Function'>

// An FSD whose function is a template with no parent level: "Prot", with its subfunction "Trip".
// Everything inside such a template is in the template's own namespace, its logical nodes included.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Private type="eIEC61850-6-100" ${id}="private-s">
			<eIEC61850-6-100:FunctionTemplate name="Prot" desc="v1" uuid="function-source-uuid" ${id}="function-s">
				<eIEC61850-6-100:LNode iedName="None" lnClass="PTOC" lnInst="1" lnType="PTOC_Type" uuid="lnode-source-uuid" ${id}="lnode-s"/>
				<eIEC61850-6-100:SubFunctionTemplate name="Trip" uuid="sub-function-source-uuid" ${id}="sub-function-s">
					<eIEC61850-6-100:LNode iedName="None" lnClass="PTRC" lnInst="1" lnType="PTRC_Type" uuid="trip-lnode-source-uuid" ${id}="trip-lnode-s"/>
				</eIEC61850-6-100:SubFunctionTemplate>
			</eIEC61850-6-100:FunctionTemplate>
		</Private>
		<DataTypeTemplates ${id}="data-type-templates-s">
			<LNodeType id="PTOC_Type" lnClass="PTOC" ${id}="ptoc-type-s">
				<DO name="Op" type="ACT_Type" ${id}="ptoc-do-s"/>
			</LNodeType>
			<LNodeType id="PTRC_Type" lnClass="PTRC" ${id}="ptrc-type-s">
				<DO name="Tr" type="ACT_Type" ${id}="ptrc-do-s"/>
			</LNodeType>
			<DOType id="ACT_Type" cdc="ACT" ${id}="act-type-s">
				<DA name="general" bType="BOOLEAN" fc="ST" ${id}="act-da-s"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>
`

// A project whose bay "B1" holds a function of its own, "Local".
const projectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t">
					<Function name="Local" uuid="local-function-uuid" ${id}="local-function-t"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A report node and every node below it. */
function flattenNodes(node: DiffNode): DiffNode[] {
	return [node, ...node.children.flatMap(flattenNodes)]
}

/** Every function and subfunction of the project: its kind, where it sits, what it was made from. */
async function listFunctions(query: Scl.Query): Promise<string[]> {
	const listed: string[] = []
	for (const tagName of ['Function', 'SubFunction'] as const) {
		for (const record of await query.getRecordsByTagName(tagName)) {
			const elementPath = await buildElementPath(query, record)
			const lineage = await query.getAttribute(record, { name: 'templateUuid' })
			listed.push(`${tagName} ${elementPath?.path ?? ''}${lineage ? ` ← ${lineage}` : ''}`)
		}
	}
	return listed.sort()
}

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The project element the consumer started from. */
	anchor: Scl.Ref<Scl.ElementsOf>
	expected: {
		/** Every function and subfunction of the project once applied. */
		functions: string[]
	}
}

describe('lifecycle scenario — an FSD whose function is a template with no parent level', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'started from a bay → placed in the bay as a function, its subfunction template as a subfunction':
			{
				sourceXml,
				targetXml: projectXml,
				anchor: bayRef,
				expected: {
					functions: [
						'Function S1/V1/B1/Local',
						'Function S1/V1/B1/Prot ← function-source-uuid',
						'SubFunction S1/V1/B1/Prot/Trip ← sub-function-source-uuid',
					],
				},
			},
		'started from a voltage level → placed there: such a template may be placed at any level': {
			sourceXml,
			targetXml: projectXml,
			anchor: voltageLevelRef,
			expected: {
				functions: [
					'Function S1/V1/B1/Local',
					'Function S1/V1/Prot ← function-source-uuid',
					'SubFunction S1/V1/Prot/Trip ← sub-function-source-uuid',
				],
			},
		},
		'started from the substation → placed there': {
			sourceXml,
			targetXml: projectXml,
			anchor: substationRef,
			expected: {
				functions: [
					'Function S1/Prot ← function-source-uuid',
					'Function S1/V1/B1/Local',
					'SubFunction S1/Prot/Trip ← sub-function-source-uuid',
				],
			},
		},
		'started from a function → placed in it as a subfunction': {
			sourceXml,
			targetXml: projectXml,
			anchor: localFunctionRef,
			expected: {
				functions: [
					'Function S1/V1/B1/Local',
					'SubFunction S1/V1/B1/Local/Prot ← function-source-uuid',
					'SubFunction S1/V1/B1/Local/Prot/Trip ← sub-function-source-uuid',
				],
			},
		},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		const lifecycleTarget = {
			verb: 'fsd' as const,
			sourceQuery: source.query,
			ref: functionTemplateRef,
			anchor: testCase.anchor,
			scenario: 'instantiate' as const,
		}

		// the report speaks of what the project will hold: a function and a subfunction
		const lifecycleReport = await report(target.query, lifecycleTarget)
		expect(lifecycleReport.needsDecisions, 'report').toBe(false)
		const announced = lifecycleReport.instances
			.flatMap((instance) => flattenNodes(instance.tree))
			.filter((node) => node.tagName !== 'LNode')
			.map((node) => `${node.change} ${node.tagName}`)
		expect(announced, 'report').toEqual(['added Function', 'added SubFunction'])
		const [group] = allGroups(lifecycleReport)
		expect(group.primary.tagName, 'report').toBe('Function')

		await target.transaction(async (tx) => {
			await apply(tx, { ...lifecycleTarget, report: lifecycleReport })
		})

		expect(await listFunctions(target.query), 'apply').toEqual(testCase.expected.functions)

		// nothing of the template's own kind reaches the project, and its types came along
		expect(await target.query.getRecordsByTagName('FunctionTemplate'), 'apply').toEqual([])
		expect(await target.query.getRecordsByTagName('SubFunctionTemplate'), 'apply').toEqual([])
		const lnodeTypes = await target.query.getRecordsByTagName('LNodeType')
		expect(lnodeTypes.length, 'apply').toBe(2)

		const appliedXml = (await target.query.getSnapshot({ as: 'xml' })) as string
		expect(appliedXml, 'apply').not.toContain('FunctionTemplate')
		// every element is in the namespace the schema declares for it where it now sits
		assertValidSclXml(appliedXml)
		expect(collectReferenceViolations({ xml: appliedXml }), 'apply').toEqual([])
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type UpdateTestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** What the template's author changes between the instantiate and the update. */
	editTemplate: (tx: Scl.Transaction) => Promise<void>
	expected: {
		/** What the update's report announces, logical nodes left out when unchanged. */
		announced: string[]
		/** The description of the placed function once updated. */
		description: string
		/** The logical nodes of the placed subfunction once updated, by class. */
		subFunctionLNodes: string[]
	}
}

describe('lifecycle scenario — updating the instance of a function template', () => {
	const testCases: SclTest.TestCases<UpdateTestCase> = {
		'nothing changed in the template → the instance is found by its lineage and is up to date': {
			sourceXml,
			targetXml: projectXml,
			editTemplate: async () => {},
			expected: {
				announced: ['unchanged Function', 'unchanged SubFunction'],
				description: 'v1',
				subFunctionLNodes: ['PTRC'],
			},
		},
		'the template is described anew and its subfunction gains a logical node → both reach the placed function':
			{
				sourceXml,
				targetXml: projectXml,
				editTemplate: async (tx) => {
					await tx.update(functionTemplateRef, { attributes: { desc: 'v2' } })
					await tx.addChild(
						{
							tagName: 'SubFunctionTemplate',
							id: 'sub-function-s',
						} as Scl.Ref<'SubFunctionTemplate'>,
						{
							tagName: 'LNode',
							attributes: {
								iedName: 'None',
								lnClass: 'PTOC',
								lnInst: '2',
								lnType: 'PTOC_Type',
								uuid: 'gained-lnode-source-uuid',
							},
						},
					)
				},
				expected: {
					announced: ['modified Function', 'unchanged SubFunction', 'added LNode'],
					description: 'v2',
					subFunctionLNodes: ['PTOC', 'PTRC'],
				},
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<UpdateTestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		const lifecycleTarget = {
			verb: 'fsd' as const,
			sourceQuery: source.query,
			ref: functionTemplateRef,
			anchor: bayRef,
		}

		// 1. first instantiate
		const instantiateReport = await report(target.query, {
			...lifecycleTarget,
			scenario: 'instantiate',
		})
		await target.transaction(async (tx) => {
			await apply(tx, { ...lifecycleTarget, scenario: 'instantiate', report: instantiateReport })
		})

		// 2. the template moves on
		await source.transaction(testCase.editTemplate)

		// 3. the update
		const updateReport = await report(target.query, { ...lifecycleTarget, scenario: 'template' })
		const announced = updateReport.instances
			.flatMap((instance) => flattenNodes(instance.tree))
			.filter((node) => node.tagName !== 'LNode' || node.change !== 'unchanged')
			.map((node) => `${node.change} ${node.tagName}`)
		expect(announced, 'report').toEqual(testCase.expected.announced)

		await target.transaction(async (tx) => {
			await apply(tx, {
				...lifecycleTarget,
				scenario: 'template',
				report: updateReport,
				resolution: { decisions: new Map() },
			})
		})

		// one function was placed, and it is still the only one made from the template
		const placed = await target.query.findByAttributes({
			tagName: 'Function',
			attributes: { templateUuid: 'function-source-uuid' },
		})
		expect(placed.length, 'apply').toBe(1)
		const description = await target.query.getAttribute(placed[0], { name: 'desc' })
		expect(description, 'apply').toBe(testCase.expected.description)

		const [placedSubFunction] = await target.query.findByAttributes({
			tagName: 'SubFunction',
			attributes: { templateUuid: 'sub-function-source-uuid' },
		})
		const { LNode: lnodes = [] } = await target.query.findDescendants(
			{ tagName: 'SubFunction', id: placedSubFunction.id } as Scl.Ref<'SubFunction'>,
			{ collect: 'LNode' },
		)
		const subFunctionLNodes: string[] = []
		for (const lnode of lnodes) {
			const lnClass = await target.query.getAttribute(lnode, { name: 'lnClass' })
			subFunctionLNodes.push(lnClass ?? '')
		}
		expect(subFunctionLNodes.sort(), 'apply').toEqual(testCase.expected.subFunctionLNodes)

		const appliedXml = (await target.query.getSnapshot({ as: 'xml' })) as string
		expect(appliedXml, 'apply').not.toContain('FunctionTemplate')
		assertValidSclXml(appliedXml)
		expect(collectReferenceViolations({ xml: appliedXml }), 'apply').toEqual([])
	}

	runSclTestCases.withoutExport({ testCases, act })
})
