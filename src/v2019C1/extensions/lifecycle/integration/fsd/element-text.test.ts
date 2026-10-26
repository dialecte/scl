import { listGroups } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { fsd as updateFsd } from '@/v2019C1/extensions/lifecycle/update/transaction'
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
	/** The newer template gains vendor data of another type. */
	gainedVendorData?: { type: string; text: string }
	/** The project empties its copy of the vendor data before the update. */
	projectEmptiesIt?: boolean
	/** The project deletes its copy of the vendor data before the update. */
	projectDeletesIt?: boolean
	/** The text of the vendor data when the function is placed, the source's otherwise. */
	placedText?: string
	/** The newer template also changes the function's description attribute. */
	newerDesc?: string
	/** The newer template changes the function's `Text`. */
	newerDescription?: string
	/** The update verb is called on its own, with no report and no decision. */
	updatedDirectly?: boolean
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
		'the template gains vendor data of another type: listed added, and written beside': {
			sourceXml,
			targetXml,
			newerText: 'v1',
			gainedVendorData: { type: 'ACME-SERIAL', text: '42' },
			expectedGroups: ['added Private'],
			expectedTextChanges: [],
			expectedQueries: [
				'//default:Function[@name="Prot"]/default:Private[@type="ACME"][text()="v1"]',
				'//default:Function[@name="Prot"]/default:Private[@type="ACME-SERIAL"][text()="42"]',
			],
		},
		'the project emptied its copy: the text of the template is written in it, not beside': {
			sourceXml,
			targetXml,
			newerText: 'v2',
			projectEmptiesIt: true,
			expectedGroups: ['modified Private'],
			expectedTextChanges: ['Private:  -> v2'],
			expectedQueries: [
				'//default:Function[@name="Prot"]/default:Private[@type="ACME"][text()="v2"]',
			],
			unexpectedQueries: ['(//default:Function[@name="Prot"]/default:Private[@type="ACME"])[2]'],
		},
		'the same text laid out otherwise: nothing listed, the instance keeps its own': {
			sourceXml,
			targetXml,
			newerText: ' v1 ',
			expectedGroups: [],
			expectedTextChanges: [],
			expectedQueries: [
				'//default:Function[@name="Prot"]/default:Private[@type="ACME"][text()="v1"]',
			],
		},
		'the template gains a flag of a tool, without text: nothing listed': {
			sourceXml,
			targetXml,
			newerText: 'v1',
			gainedVendorData: { type: 'ACME-FLAG', text: ' ' },
			expectedGroups: [],
			expectedTextChanges: [],
			unexpectedQueries: ['//default:Function[@name="Prot"]/default:Private[@type="ACME-FLAG"]'],
		},
		'the project deleted its copy, keeping data of another tool: the copy is added again, the other left as it is':
			{
				sourceXml: sourceXml.replace(
					`<Private type="ACME" ${id}="vendor-s">v1</Private>`,
					`<Private type="ACME" ${id}="vendor-s">v1</Private><Private type="BETA" ${id}="other-vendor-s">w1</Private>`,
				),
				targetXml,
				newerText: 'v1',
				projectDeletesIt: true,
				expectedGroups: ['added Private'],
				expectedTextChanges: [],
				expectedQueries: [
					'//default:Function[@name="Prot"]/default:Private[@type="ACME"][text()="v1"]',
					'//default:Function[@name="Prot"]/default:Private[@type="BETA"][text()="w1"]',
				],
			},
		'the same text laid out otherwise, beside a change of the function: the instance keeps its own text':
			{
				sourceXml,
				targetXml,
				newerText: ' v1 ',
				newerDesc: 'rev2',
				expectedGroups: ['modified Function'],
				expectedTextChanges: [],
				expectedQueries: [
					'//default:Function[@name="Prot"][@desc="rev2"]/default:Private[@type="ACME"][text()="v1"]',
				],
			},
		'… the update verb called on its own: the instance keeps its own text too': {
			sourceXml,
			targetXml,
			newerText: ' v1 ',
			newerDesc: 'rev2',
			updatedDirectly: true,
			expectedGroups: ['modified Function'],
			expectedTextChanges: [],
			expectedQueries: [
				'//default:Function[@name="Prot"][@desc="rev2"]/default:Private[@type="ACME"][text()="v1"]',
			],
		},
		'the text placed laid out with spaces: the change lists it without them': {
			sourceXml,
			targetXml,
			placedText: ' v1 ',
			newerText: 'v2',
			expectedGroups: ['modified Private'],
			expectedTextChanges: ['Private: v1 -> v2'],
			expectedQueries: [
				'//default:Function[@name="Prot"]/default:Private[@type="ACME"][text()="v2"]',
			],
		},
		'two wrappers of one type: each is compared with its own': {
			sourceXml: sourceXml.replace(
				`<Private type="ACME" ${id}="vendor-s">v1</Private>`,
				`<Private type="ACME" ${id}="vendor-s">v1</Private><Private type="ACME" ${id}="second-vendor-s">x1</Private>`,
			),
			targetXml,
			newerText: 'v2',
			expectedGroups: ['modified Private'],
			expectedTextChanges: ['Private: v1 -> v2'],
			expectedQueries: [
				'//default:Function[@name="Prot"]/default:Private[@type="ACME"][text()="v2"]',
				'//default:Function[@name="Prot"]/default:Private[@type="ACME"][text()="x1"]',
			],
		},
		'the description of the function changed: listed on its text, and written': {
			sourceXml: sourceXml.replace(
				`<Private type="ACME" ${id}="vendor-s">v1</Private>`,
				`<Text ${id}="text-s">about</Text><Private type="ACME" ${id}="vendor-s">v1</Private>`,
			),
			targetXml,
			newerText: 'v1',
			newerDescription: 'changed',
			expectedGroups: ['modified Text'],
			expectedTextChanges: ['Text: about -> changed'],
			expectedQueries: ['//default:Function[@name="Prot"]/default:Text[text()="changed"]'],
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
		const placedText = testCase.placedText
		if (placedText !== undefined) {
			await source.transaction(async function layOutTheVendorData(tx) {
				await tx.update({ tagName: 'Private', id: 'vendor-s' }, { value: placedText })
			})
		}
		await target.transaction(async function placeTheFunction(tx) {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
		})
		await source.transaction(async function changeTheVendorData(tx) {
			await tx.update({ tagName: 'Private', id: 'vendor-s' }, { value: testCase.newerText })
			if (testCase.newerDesc)
				await tx.update(functionRef, { attributes: { desc: testCase.newerDesc } })
			if (testCase.newerDescription) {
				await tx.update({ tagName: 'Text', id: 'text-s' }, { value: testCase.newerDescription })
			}
			const gained = testCase.gainedVendorData
			if (gained) {
				await tx.addChild(functionRef, {
					tagName: 'Private',
					attributes: { type: gained.type },
					value: gained.text,
				})
			}
		})
		if (testCase.projectEmptiesIt) await target.transaction(emptyTheVendorData)
		if (testCase.projectDeletesIt) await target.transaction(deleteTheVendorData)
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
			if (testCase.updatedDirectly) {
				await updateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
			} else {
				await apply(tx, { ...lifecycle, report: reported, resolution: { decisions } })
			}
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The project's copy of the vendor data, emptied. */
async function emptyTheVendorData(tx: Scl.Transaction): Promise<void> {
	const [vendor] = await tx.findByAttributes({ tagName: 'Private', attributes: { type: 'ACME' } })
	if (vendor) await tx.update({ tagName: 'Private', id: vendor.id }, { value: '' })
}

/** The project's copy of the vendor data, deleted. */
async function deleteTheVendorData(tx: Scl.Transaction): Promise<void> {
	const [vendor] = await tx.findByAttributes({ tagName: 'Private', attributes: { type: 'ACME' } })
	if (vendor) await tx.delete({ tagName: 'Private', id: vendor.id })
}

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
