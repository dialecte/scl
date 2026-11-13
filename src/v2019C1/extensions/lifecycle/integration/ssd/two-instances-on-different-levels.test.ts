/// <reference types="vite/client" />
import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { buildElementPath } from '@/v2019C1/extensions/reference/query/build'
import { runSclTestCases } from '@/v2019C1/test'
import { expectExportedQueries } from '@/v2019C1/test/expect-exported-queries'
import { openSclDocument } from '@/v2019C1/test/open-scl-document'

import type { Scl } from '@/v2019C1/config'
import type {
	DiffNode,
	KeptAttributeChange,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { DecisionMapping, ReportMapping } from '@/v2019C1/extensions/lifecycle/mapping'
import type { SclTest } from '@/v2019C1/test'

/** The fixtures of this folder, whole documents read as they are. */
const FIXTURES: Readonly<Record<string, string>> = import.meta.glob<string>('./fixtures/*.xml', {
	query: '?raw',
	import: 'default',
	eager: true,
})

/**
 * The case's document is the project. `placedXml` is placed in its substation twice, each time with its own choices for
 * the template's levels (`placements`, by source record id), then `templateXml`, its newer revision, updates both.
 */
type TwoPlacementsTestCase = SclTest.BaseXmlTestCase & {
	placedXml: string
	templateXml: string
	placements: [string, DecisionMapping][][]
}

/** What an update lists of one mapping, read from the report: its tag, whether it is locked, where it lands. */
type ListedMapping = { tagName: string; locked: boolean; landsOn: string }

/** A change of the template an update keeps off an instance, read from the report, with the path of the element it is on. */
type KeptChange = KeptAttributeChange & { at: string }

/** What one instance of the update's report lists: its mappings, and the template's changes it keeps off. */
type ListedInstance = { mappings: ListedMapping[]; kept: KeptChange[] }

type ReportTestCase = TwoPlacementsTestCase & {
	/** What each instance the report lists carries, by the path of the instance's root: nothing else is listed. */
	expectedInstances: Record<string, ListedInstance>
}

const substationRef = { tagName: 'Substation', id: 'substation-t' } as Scl.Ref<'Substation'>
const templateRef = { tagName: 'Substation', id: 'substation-s' } as Scl.Ref<'Substation'>

/** The first instance's voltage level mapped onto the project's E1, the second one's created beside it. */
const onE1ThenCreated: [string, DecisionMapping][][] = [
	[['voltage-level-s', { existing: { tagName: 'VoltageLevel', id: 'voltage-level-t' } }]],
	[['voltage-level-s', { create: {} }]],
]

/** Place the case's template twice, each with its own choices; then report the newer template's update of both. */
async function placeTwiceAndReportUpdate(
	params: SclTest.ActParams<TwoPlacementsTestCase>,
): Promise<Awaited<ReturnType<typeof report>>> {
	const { testCase, project, source } = params
	const placed = await openSclDocument({ project, xml: testCase.placedXml, label: 'template' })
	for (const choices of testCase.placements) {
		const placement = {
			verb: 'ssd' as const,
			scenario: 'instantiate' as const,
			sourceQuery: placed.query,
			ref: templateRef,
			anchor: substationRef,
			resolution: { mappings: new Map(choices) },
		}
		const placementReport = await report(source.query, placement)
		await source.transaction(async function place(tx) {
			await apply(tx, {
				...placement,
				report: placementReport,
				resolution: { decisions: new Map(), mappings: new Map(choices) },
			})
		})
	}
	const template = await openSclDocument({
		project,
		xml: testCase.templateXml,
		label: 'newer template',
	})
	const update = {
		verb: 'ssd' as const,
		scenario: 'template' as const,
		sourceQuery: template.query,
		ref: templateRef,
		anchor: substationRef,
	}
	const updateReport = await report(source.query, update)
	await source.transaction(async function write(tx) {
		await apply(tx, { ...update, report: updateReport, resolution: { decisions: new Map() } })
	})
	return updateReport
}

/**
 * One template placed twice in one project, its voltage level mapped onto the project's level of its name the first
 * time and created beside it the second: an update of both finds each instance by what it created, and reconciles each
 * where it sits. What one instance placed — its roles, its category, its variable — stays its own; a variable's value is
 * the instance's configuration, which the update keeps.
 */
describe('update.ssd - two instances of one template on different voltage levels', () => {
	const testCases: SclTest.TestCases<TwoPlacementsTestCase> = {
		'placed on E1, then on a level created beside it, the template gaining a role and a new variable value → each bay updated where it sits, with its own roles, category and variable, its value kept':
			{
				// the project holds S1/E1, empty; revision 1's bay Q1 holds PIU, MEASUREMENT, PICKUP=1 and the application
				// Control; revision 2 adds BAY_CTRL (and Control's reference to it) and sets PICKUP=2
				sourceXml: FIXTURES['./fixtures/project-with-voltage-level-e1.xml'],
				placedXml: FIXTURES['./fixtures/bay-with-a-role-category-and-variable.xml'],
				templateXml: FIXTURES['./fixtures/bay-gaining-a-role-and-a-new-value.xml'],
				placements: onE1ThenCreated,
				expectedQueries: [
					// the first instance, in the project's E1
					'//default:VoltageLevel[@name="E1"][@uuid="e1-uuid"]/default:Bay[@name="Q1"]/default:Private/v2019C1:AllocationRole[@name="PIU"]/v2019C1:FunctionRef[@function="S1/E1/Q1/Prot"]',
					'//default:VoltageLevel[@name="E1"][@uuid="e1-uuid"]/default:Bay[@name="Q1"]/default:Private/v2019C1:AllocationRole[@name="BAY_CTRL"][@templateUuid="bay-ctrl-source-uuid"]/v2019C1:FunctionRef[@function="S1/E1/Q1/Prot"]',
					'//default:VoltageLevel[@name="E1"][@uuid="e1-uuid"]/default:Bay[@name="Q1"]/default:Private/v2019C1:Application[@name="Control"]/v2019C1:AllocationRoleRef[@allocationRole="S1/E1/Q1/BAY_CTRL"]',
					'//default:VoltageLevel[@name="E1"][@uuid="e1-uuid"]/default:Bay[@name="Q1"]/default:Private/v2019C1:FunctionCategory[@name="MEASUREMENT"]/v2019C1:FunctionCatRef[@function="S1/E1/Q1/Prot"]',
					'//default:VoltageLevel[@name="E1"][@uuid="e1-uuid"]/default:Bay[@name="Q1"]/default:Private/v2019C1:Variable[@name="PICKUP"][@value="1"]/v2019C1:VariableApplyTo[@element="S1/E1/Q1/Prot"]',
					// the second instance, in the level created beside it
					'//default:VoltageLevel[@name="E1_1"]/default:Bay[@name="Q1"]/default:Private/v2019C1:AllocationRole[@name="PIU"]/v2019C1:FunctionRef[@function="S1/E1_1/Q1/Prot"]',
					'//default:VoltageLevel[@name="E1_1"]/default:Bay[@name="Q1"]/default:Private/v2019C1:AllocationRole[@name="BAY_CTRL"][@templateUuid="bay-ctrl-source-uuid"]/v2019C1:FunctionRef[@function="S1/E1_1/Q1/Prot"]',
					'//default:VoltageLevel[@name="E1_1"]/default:Bay[@name="Q1"]/default:Private/v2019C1:Application[@name="Control"]/v2019C1:AllocationRoleRef[@allocationRole="S1/E1_1/Q1/BAY_CTRL"]',
					'//default:VoltageLevel[@name="E1_1"]/default:Bay[@name="Q1"]/default:Private/v2019C1:FunctionCategory[@name="MEASUREMENT"]/v2019C1:FunctionCatRef[@function="S1/E1_1/Q1/Prot"]',
					'//default:VoltageLevel[@name="E1_1"]/default:Bay[@name="Q1"]/default:Private/v2019C1:Variable[@name="PICKUP"][@value="1"]/v2019C1:VariableApplyTo[@element="S1/E1_1/Q1/Prot"]',
				],
				unexpectedQueries: [
					// each instance found where it sits: no third bay, no third level
					'//default:VoltageLevel[count(default:Bay) > 1]',
					'//default:Substation[count(default:VoltageLevel) > 2]',
					// each bay holds its own once: two roles, one category, one variable, one application, one Private
					'//default:Bay/default:Private[count(v2019C1:AllocationRole) != 2 or count(v2019C1:FunctionCategory) != 1 or count(v2019C1:Variable) != 1 or count(v2019C1:Application) != 1]',
					'//default:Bay[count(default:Private) > 1]',
					// nothing written above the bays
					'//v2019C1:AllocationRole[not(ancestor::default:Bay)]',
					'//v2019C1:FunctionCategory[not(ancestor::default:Bay)]',
					'//v2019C1:Variable[not(ancestor::default:Bay)]',
					// the value is the instance's configuration: the template's new one is not written
					'//v2019C1:Variable[@value="2"]',
					// nothing of one instance names the other's
					'//default:VoltageLevel[@name="E1"]//*[contains(@function, "/E1_1/") or contains(@element, "/E1_1/") or contains(@allocationRole, "/E1_1/")]',
					'//default:VoltageLevel[@name="E1_1"]//*[contains(@function, "/E1/") or contains(@element, "/E1/") or contains(@allocationRole, "/E1/")]',
					// …by uuid either: every reference names an element of its own bay
					'//default:Bay//*[@functionUuid][not(@functionUuid = ancestor::default:Bay/default:Function/@uuid)]',
					'//default:Bay//*[@elementUuid][not(@elementUuid = ancestor::default:Bay/default:Function/@uuid)]',
					'//default:Bay//*[@allocationRoleUuid][not(@allocationRoleUuid = ancestor::default:Bay/default:Private/v2019C1:AllocationRole/@uuid)]',
				],
			},
	}

	async function act(params: SclTest.ActParams<TwoPlacementsTestCase>): Promise<SclTest.ActResult> {
		await placeTwiceAndReportUpdate(params)
		await expectExportedQueries({ act: params })
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The update's report lists the choices each placement made as locked, each where its instance sits. */
describe('report.ssd - an update of two instances lists the earlier choices as locked', () => {
	const testCases: SclTest.TestCases<ReportTestCase> = {
		'placed on E1, then on a level created beside it → each level, bay, role and category locked onto its own instance, the gained role created in each bay, the new value kept off each':
			{
				// the same documents: revision 1's bay Q1 holds PIU, MEASUREMENT, PICKUP=1; revision 2 adds BAY_CTRL and sets
				// PICKUP=2
				sourceXml: FIXTURES['./fixtures/project-with-voltage-level-e1.xml'],
				placedXml: FIXTURES['./fixtures/bay-with-a-role-category-and-variable.xml'],
				templateXml: FIXTURES['./fixtures/bay-gaining-a-role-and-a-new-value.xml'],
				placements: onE1ThenCreated,
				expectedInstances: {
					'S1/E1': {
						mappings: [
							{ tagName: 'Bay', locked: true, landsOn: 'S1/E1/Q1' },
							{ tagName: 'Substation', locked: true, landsOn: 'S1' },
							{ tagName: 'VoltageLevel', locked: true, landsOn: 'S1/E1' },
						],
						kept: [],
					},
					'S1/E1/Q1/Control': {
						mappings: [
							{ tagName: 'AllocationRole', locked: true, landsOn: 'S1/E1/Q1/PIU' },
							{ tagName: 'AllocationRole', locked: false, landsOn: 'created in S1/E1/Q1' },
						],
						kept: [],
					},
					'S1/E1/Q1/Prot': {
						mappings: [
							{ tagName: 'FunctionCategory', locked: true, landsOn: 'S1/E1/Q1/MEASUREMENT' },
						],
						kept: [
							{
								at: 'S1/E1/Q1/PICKUP',
								name: 'value',
								before: '1',
								after: '2',
								reason: 'instance-configuration',
							},
						],
					},
					'S1/E1_1': {
						mappings: [
							{ tagName: 'Bay', locked: true, landsOn: 'S1/E1_1/Q1' },
							{ tagName: 'Substation', locked: true, landsOn: 'S1' },
							{ tagName: 'VoltageLevel', locked: true, landsOn: 'S1/E1_1' },
						],
						kept: [],
					},
					'S1/E1_1/Q1/Control': {
						mappings: [
							{ tagName: 'AllocationRole', locked: true, landsOn: 'S1/E1_1/Q1/PIU' },
							{ tagName: 'AllocationRole', locked: false, landsOn: 'created in S1/E1_1/Q1' },
						],
						kept: [],
					},
					'S1/E1_1/Q1/Prot': {
						mappings: [
							{ tagName: 'FunctionCategory', locked: true, landsOn: 'S1/E1_1/Q1/MEASUREMENT' },
						],
						kept: [
							{
								at: 'S1/E1_1/Q1/PICKUP',
								name: 'value',
								before: '1',
								after: '2',
								reason: 'instance-configuration',
							},
						],
					},
				},
			},
	}

	async function act(params: SclTest.ActParams<ReportTestCase>): Promise<void> {
		const updateReport = await placeTwiceAndReportUpdate(params)
		// each instance carries the mappings it holds (the report's own list names each source element once): read per
		// instance, by where its root sits
		const listed: Record<string, ListedInstance> = {}
		for (const instance of updateReport.instances) {
			const rootPath = instance.rootRef
				? await buildElementPath(params.source.query, instance.rootRef as Scl.Ref<Scl.ElementsOf>)
				: undefined
			const kept: KeptChange[] = []
			for (const node of flattenNodes(instance.tree)) {
				const at = node.instanceRef
					? await buildElementPath(params.source.query, node.instanceRef as Scl.Ref<Scl.ElementsOf>)
					: undefined
				for (const change of node.keptAttributeChanges ?? [])
					kept.push({ at: at?.path ?? '', ...change })
			}
			listed[rootPath?.path ?? ''] = {
				mappings: instance.mappings.map(listMapping).sort(byTagAndPlace),
				kept,
			}
		}
		expect(listed).toEqual(params.testCase.expectedInstances)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** A mapping as the case lists it: where it lands, by the path of the element it is mapped onto or created in. */
function listMapping(mapping: ReportMapping): ListedMapping {
	const onto =
		mapping.mapping && 'existing' in mapping.mapping ? mapping.candidates[0]?.path : undefined
	return {
		tagName: mapping.tagName,
		locked: mapping.locked,
		landsOn: onto ?? `created in ${mapping.parentPath ?? ''}`,
	}
}

/** A report node and every node below it. */
function flattenNodes(node: DiffNode): DiffNode[] {
	return [node, ...node.children.flatMap(flattenNodes)]
}

function byTagAndPlace(left: ListedMapping, right: ListedMapping): number {
	return compareText(`${left.tagName} ${left.landsOn}`, `${right.tagName} ${right.landsOn}`)
}

/** Text order by code point: `S1/E1/…` before `S1/E1_1/…`, whatever the locale. */
function compareText(left: string, right: string): number {
	if (left === right) return 0
	return left < right ? -1 : 1
}
