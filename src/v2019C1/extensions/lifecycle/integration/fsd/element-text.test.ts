import { listGroups } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type {
	DecisionMap,
	DiffNode,
	DiffReport,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'prot-s' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The text the newer template gives the vendor data. */
	newerText: string
	/** The groups of the update are declined. */
	declined?: boolean
	/** The groups of the update's report, `<change> <tag>`, sorted. */
	expectedGroups: string[]
	/** The text changes the report lists, `<tag>: <before> -> <after>`. */
	expectedTextChanges: string[]
}

/** A function template carrying vendor data as the text of a `Private` of its own type. */
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="prot-template-uuid" ${id}="prot-s">
						<Private type="ACME" ${id}="vendor-s">v1</Private>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A text the template changed reaches the instance as an attribute does: listed, written when accepted, kept when
// declined.
describe('fsd update: the text of an element is compared and reconciled like an attribute', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the vendor data changed: listed, and written': {
			sourceXml,
			targetXml,
			newerText: 'v2',
			expectedGroups: ['modified Private'],
			expectedTextChanges: ['Private: v1 -> v2'],
			expectedQueries: [
				'//default:Function[@name="Prot"]/default:Private[@type="ACME"][text()="v2"]',
			],
		},
		'… declined: the instance keeps its text': {
			sourceXml,
			targetXml,
			newerText: 'v2',
			declined: true,
			expectedGroups: ['modified Private'],
			expectedTextChanges: ['Private: v1 -> v2'],
			expectedQueries: [
				'//default:Function[@name="Prot"]/default:Private[@type="ACME"][text()="v1"]',
			],
		},
		'the same text: nothing listed': {
			sourceXml,
			targetXml,
			newerText: 'v1',
			expectedGroups: [],
			expectedTextChanges: [],
			expectedQueries: [
				'//default:Function[@name="Prot"]/default:Private[@type="ACME"][text()="v1"]',
			],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async function placeTheFunction(tx) {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
		})
		await source.transaction(async function changeTheVendorData(tx) {
			await tx.update({ tagName: 'Private', id: 'vendor-s' }, { value: testCase.newerText })
		})
		const lifecycle: LifecycleTarget = {
			verb: 'fsd',
			sourceQuery: source.query,
			ref: functionRef,
			anchor: bayRef,
			scenario: 'template',
		}
		const reported = await report(target.query, lifecycle)
		expect(listGroups(reported)).toEqual(testCase.expectedGroups)
		expect(listTextChanges(reported)).toEqual(testCase.expectedTextChanges)
		const decisions: DecisionMap = testCase.declined ? declineEvery(reported) : new Map()
		await target.transaction(async function applyTheUpdate(tx) {
			await apply(tx, { ...lifecycle, report: reported, resolution: { decisions } })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** Every group of a report declined. */
function declineEvery(reported: DiffReport): DecisionMap {
	return new Map(allGroups(reported).map((group) => [group.id, 'skip' as const]))
}

/** The text changes of every node of a report, `<tag>: <before> -> <after>`. */
function listTextChanges(reported: DiffReport): string[] {
	const changes: string[] = []
	for (const instance of reported.instances) collectTextChanges({ node: instance.tree, changes })
	return changes
}

function collectTextChanges(params: { node: DiffNode; changes: string[] }): void {
	const { node, changes } = params
	if (node.textChange) {
		changes.push(
			`${node.tagName}: ${node.textChange.before ?? ''} -> ${node.textChange.after ?? ''}`,
		)
	}
	for (const child of node.children) collectTextChanges({ node: child, changes })
}
