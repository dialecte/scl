import { reportFsd } from './report-fsd'

import { describe, expect } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DiffNode } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const categoryRef = { tagName: 'FunctionCategory', id: 'cat-s' } as Scl.Ref<'FunctionCategory'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	mutate: (tx: Scl.Transaction) => Promise<void>
}

// A Function carrying a FunctionCategory satellite that ALREADY EXISTS in the target
// (the category was created on the first instantiate). A LATER template change only
// ADDS a new FunctionCatRef INTO that existing category. The added ref lands inside a
// pre-existing (matched) container, so the report must fold the satellite as a
// STRUCTURED companion — the existing FunctionCategory (anchored by `instanceRef`)
// carrying the added ref nested inside — never a flattened top-level ref whose
// container the review UI cannot resolve (FunctionCatRef has no `name`).
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="cat-src-uuid" ${id}="cat-s">
					<eIEC61850-6-100:FunctionCatRef functionUuid="fn-src-uuid" function="TEMPLATE/Prot" ${id}="catref-s"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1" uuid="lnode-src-uuid"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt-s">
			<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-s">
				<DO name="Pos" type="DPC_Type" ${id}="do-s"/>
			</LNodeType>
			<DOType id="DPC_Type" cdc="DPC" ${id}="dot-s">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-s"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>`

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>`

/** Depth-first search for a changed node of the given tag anywhere in a companion subtree. */
function findInTree(node: DiffNode, predicate: (node: DiffNode) => boolean): DiffNode | undefined {
	if (predicate(node)) return node
	for (const child of node.children) {
		const found = findInTree(child, predicate)
		if (found) return found
	}
	return undefined
}

describe('reportFsd — adding a ref into an already-existing FunctionCategory satellite', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the added ref folds nested under the existing category companion (structured, not flattened)':
			{
				sourceXml,
				targetXml,
				mutate: async (tx) => {
					// touch the function so its decision group exists (the satellite rides it)
					await tx.update(functionRef, { attributes: { desc: 'updated function' } })
					// add a NEW ref into the already-instantiated category
					await tx.addChild(categoryRef, {
						tagName: 'FunctionCatRef',
						attributes: { functionUuid: 'fn2-src-uuid', function: 'TEMPLATE/Prot2' },
					})
				},
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		// first instantiate: the category (and its first ref) now exist in the target
		await target.transaction(async (tx) => {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
		})
		// template change: add a second ref into that existing category
		await source.transaction(testCase.mutate)

		const report = await reportFsd(target.query, {
			sourceQuery: source.query,
			functionRef,
			targetParent: bayRef,
		})

		const functionGroup = allGroups(report).find((group) => group.primary.tagName === 'Function')
		expect(functionGroup, 'function decision group present').toBeDefined()

		// the satellite rides as a STRUCTURED companion: the existing category, anchored
		// to its instance, carrying the added ref nested inside.
		const category = functionGroup!.companions.find((node) => node.tagName === 'FunctionCategory')
		expect(category, 'FunctionCategory folded as a structured companion').toBeDefined()
		expect(category!.instanceRef?.id, 'category anchored to its existing instance').toBeDefined()

		const addedRef = findInTree(
			category!,
			(node) => node.tagName === 'FunctionCatRef' && node.change === 'added',
		)
		expect(addedRef, 'the added ref is nested under the existing category').toBeDefined()

		// it must NOT be flattened to a top-level companion (no container to anchor to)
		const flatRef = functionGroup!.companions.find((node) => node.tagName === 'FunctionCatRef')
		expect(flatRef, 'no flattened top-level ref companion').toBeUndefined()
	}

	runSclTestCases.withoutExport({ testCases, act })
})
