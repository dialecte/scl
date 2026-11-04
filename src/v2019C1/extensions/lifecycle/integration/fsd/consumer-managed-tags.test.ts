import { listGroups } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { Resolution } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffNode, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// `consumerManagedTags` reaches every report path, not the application one alone: the function report (the
// instance's own children) and the satellite report (the categories that classify the function).

const functionRef = { tagName: 'Function', id: 'function-s' } as Scl.Ref<'Function'>
const categoryRef = { tagName: 'FunctionCategory', id: 'category-s' } as Scl.Ref<'FunctionCategory'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="template">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" desc="rev1" uuid="category-uuid" ${id}="category-s">
					<eIEC61850-6-100:FunctionCatRef functionUuid="function-uuid" function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" ${id}="category-reference-s"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" desc="rev1" uuid="function-uuid" ${id}="function-s">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-uuid" ${id}="lnode-s"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="types-s">
			<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnode-type-s">
				<DO name="Pos" type="DPC_Type" ${id}="data-object-s"/>
			</LNodeType>
			<DOType id="DPC_Type" cdc="DPC" ${id}="data-object-type-s">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="data-attribute-s"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>
`

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** What the consumer writes on the instance: where, and the element. */
type Addition = 'LNode in the function' | 'Text in the category'

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	addition: Addition
	/** The template changes the category: a satellite is compared with the project's only when it changed. */
	categoryChanged?: boolean
	consumerManagedTags?: Scl.ElementsOf[]
	/** The groups the report lists, `<change> <tag>`, sorted. Absent: not asserted. */
	groups?: string[]
	/** The tags of the project's own elements the report lists anywhere (groups, companions, below them), sorted. */
	listedAsProjectOwn?: string[]
}

/** The tags (each once) of every `target-only` node a report lists, in its groups and the companions and children of those. */
function listProjectOwn(report: DiffReport): string[] {
	const tags: string[] = []
	function visit(node: DiffNode): void {
		if (node.change === 'target-only') tags.push(node.tagName)
		for (const child of node.children) visit(child)
	}
	for (const group of allGroups(report)) {
		visit(group.primary)
		for (const companion of group.companions) visit(companion)
	}
	return [...new Set(tags)].sort()
}

describe('lifecycle.report — consumerManagedTags on the function and satellite reports', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		"fsd, no option → a logical node the instance's function holds without lineage is listed target-only":
			{
				sourceXml,
				targetXml: projectXml,
				addition: 'LNode in the function',
				groups: ['target-only LNode'],
			},
		'fsd, LNode named → that logical node is not listed': {
			sourceXml,
			targetXml: projectXml,
			addition: 'LNode in the function',
			consumerManagedTags: ['LNode'],
			groups: [],
		},
		"satellite, no option → a text the instance's category holds without lineage is listed target-only":
			{
				sourceXml,
				targetXml: projectXml,
				addition: 'Text in the category',
				categoryChanged: true,
				listedAsProjectOwn: ['Text'],
			},
		'satellite, Text named → that text is not listed': {
			sourceXml,
			targetXml: projectXml,
			addition: 'Text in the category',
			categoryChanged: true,
			consumerManagedTags: ['Text'],
			listedAsProjectOwn: [],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async (tx) => {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
		})

		// the consumer writes an element of its own on the instance
		const [instance] = await target.query.any.findByAttributes({
			tagName: testCase.addition === 'LNode in the function' ? 'Function' : 'FunctionCategory',
			attributes: {
				templateUuid:
					testCase.addition === 'LNode in the function' ? 'function-uuid' : 'category-uuid',
			},
		})
		if (!instance) throw new Error('instance not found')
		await target.transaction(async (tx) => {
			if (testCase.addition === 'LNode in the function') {
				await tx.addChild(
					{ tagName: 'Function', id: instance.id },
					{
						tagName: 'LNode',
						attributes: { iedName: 'None', lnClass: 'GGIO', lnInst: '9', lnType: 'CSWI_Type' },
					},
				)
			} else {
				await tx.addChild(
					{ tagName: 'FunctionCategory', id: instance.id },
					{ tagName: 'Text', attributes: {} },
				)
			}
		})
		if (testCase.categoryChanged) {
			await source.transaction(async (tx) => {
				await tx.update(categoryRef, { attributes: { desc: 'rev2' } })
			})
		}

		const resolution: Resolution = { consumerManagedTags: testCase.consumerManagedTags }
		const lifecycle = {
			verb: 'fsd' as const,
			sourceQuery: source.query,
			ref: functionRef,
			anchor: bayRef,
		}
		const reported = await report(target.query, { ...lifecycle, resolution })
		if (testCase.groups) expect(listGroups(reported), 'report').toEqual(testCase.groups)
		if (testCase.listedAsProjectOwn) {
			expect(listProjectOwn(reported), 'report').toEqual(testCase.listedAsProjectOwn)
		}

		await target.transaction(async (tx) => {
			await apply(tx, { ...lifecycle, report: reported, resolution })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
