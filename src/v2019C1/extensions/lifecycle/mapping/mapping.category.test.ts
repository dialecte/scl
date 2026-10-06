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
import type { AnyTreeRecord } from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'function-s' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>
const projectCategoryRef = {
	tagName: 'FunctionCategory',
	id: 'category-t',
} as Scl.Ref<'FunctionCategory'>

// A function classified under the category "MEASUREMENT".
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="category-source-uuid" ${id}="category-s">
					<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="category-ref-s"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// The same function, classified under the sub-category "CURRENT" of "MEASUREMENT".
const nestedSourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="category-source-uuid" ${id}="category-s">
					<eIEC61850-6-100:SubCategory name="CURRENT" uuid="sub-category-source-uuid" ${id}="sub-category-s">
						<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="category-ref-s"/>
					</eIEC61850-6-100:SubCategory>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A project whose category "MEASUREMENT" has its own description and already classifies a function.
const projectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="private-t">
				<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" desc="Project measurements" uuid="category-project-uuid" ${id}="category-t">
					<eIEC61850-6-100:FunctionCatRef function="S1/V1/B1/Local" functionUuid="local-function-uuid" ${id}="category-ref-t"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t">
					<Function name="Local" uuid="local-function-uuid" ${id}="local-function-t"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// The same project, whose category already has the sub-category "CURRENT".
const nestedProjectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="private-t">
				<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" desc="Project measurements" uuid="category-project-uuid" ${id}="category-t">
					<eIEC61850-6-100:SubCategory name="CURRENT" uuid="sub-category-project-uuid" ${id}="sub-category-t">
						<eIEC61850-6-100:FunctionCatRef function="S1/V1/B1/Local" functionUuid="local-function-uuid" ${id}="category-ref-t"/>
					</eIEC61850-6-100:SubCategory>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t">
					<Function name="Local" uuid="local-function-uuid" ${id}="local-function-t"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A project holding a category "MEASUREMENT" at two levels.
const projectWithTwoCategoriesXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="private-t">
				<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="category-project-uuid" ${id}="category-t">
					<eIEC61850-6-100:FunctionCatRef function="S1/V1/B1/Local" functionUuid="local-function-uuid" ${id}="category-ref-t"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Private type="eIEC61850-6-100" ${id}="voltage-level-private-t">
					<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="category-project-uuid-2" ${id}="category-t-2">
						<eIEC61850-6-100:FunctionCatRef function="S1/V1/B1/Local" functionUuid="local-function-uuid" ${id}="category-ref-t-2"/>
					</eIEC61850-6-100:FunctionCategory>
				</Private>
				<Bay name="B1" ${id}="bay-t">
					<Function name="Local" uuid="local-function-uuid" ${id}="local-function-t"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A project holding the category "MEASUREMENT" and another one, "PROTECTION".
const projectWithOtherCategoryXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="private-t">
				<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" desc="Project measurements" uuid="category-project-uuid" ${id}="category-t">
					<eIEC61850-6-100:FunctionCatRef function="S1/V1/B1/Local" functionUuid="local-function-uuid" ${id}="category-ref-t"/>
				</eIEC61850-6-100:FunctionCategory>
				<eIEC61850-6-100:FunctionCategory name="PROTECTION" uuid="protection-project-uuid" ${id}="protection-t">
					<eIEC61850-6-100:FunctionCatRef function="S1/V1/B1/Local" functionUuid="local-function-uuid" ${id}="protection-ref-t"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t">
					<Function name="Local" uuid="local-function-uuid" ${id}="local-function-t"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const projectProtectionRef = {
	tagName: 'FunctionCategory',
	id: 'protection-t',
} as Scl.Ref<'FunctionCategory'>

// A project with no category.
const projectWithoutCategoryXml = /* xml */ `
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
	/** The consumer's choices, by source record id. */
	chosen?: [string, DecisionMapping][]
	expected: {
		/** Where the report says the source category lands — nothing when it is the consumer's to choose. */
		mapping: DecisionMapping | undefined
		/** A fragment of the refusal when apply is run on the report as it is; nothing else is then checked. */
		applyRefusal?: string
		reason: MappingReason
		ambiguous: boolean
		/** What the report announces as new, by tag. */
		announcedNew: { FunctionCategory: number; SubCategory: number; FunctionCatRef: number }
		/** Names of every FunctionCategory of the project, once applied. */
		categoryNames: string[]
		/** How many SubCategory elements the project holds, once applied. */
		subCategories: number
		/** The containers classifying the instantiated function, once applied: category, then sub-category. */
		classifiedUnder: string[]
		/** The functions the project's own category classifies once applied, by path — left out when the project has none. */
		projectCategoryClassifies?: string[]
	}
}

/** A stored element and every element below it. */
function flattenTree(node: AnyTreeRecord): AnyTreeRecord[] {
	return [node, ...node.tree.flatMap(flattenTree)]
}

/** A report node and every node below it. */
function flattenNodes(node: DiffNode): DiffNode[] {
	return [node, ...node.children.flatMap(flattenNodes)]
}

describe('shared-element mapping — a function category', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'one category of that name in the project → report and apply both map onto it, and it keeps what it had':
			{
				sourceXml,
				targetXml: projectXml,
				expected: {
					mapping: { existing: projectCategoryRef },
					reason: 'name',
					ambiguous: false,
					announcedNew: { FunctionCategory: 0, SubCategory: 0, FunctionCatRef: 1 },
					categoryNames: ['MEASUREMENT'],
					subCategories: 0,
					classifiedUnder: ['MEASUREMENT'],
					projectCategoryClassifies: ['S1/V1/B1/Local', 'S1/V1/B1/Prot'],
				},
			},
		'the function is classified under a sub-category the project category already has → the reference lands in that sub-category, none is added':
			{
				sourceXml: nestedSourceXml,
				targetXml: nestedProjectXml,
				expected: {
					mapping: { existing: projectCategoryRef },
					reason: 'name',
					ambiguous: false,
					announcedNew: { FunctionCategory: 0, SubCategory: 0, FunctionCatRef: 1 },
					categoryNames: ['MEASUREMENT'],
					subCategories: 1,
					classifiedUnder: ['MEASUREMENT', 'CURRENT'],
					projectCategoryClassifies: ['S1/V1/B1/Local', 'S1/V1/B1/Prot'],
				},
			},
		'no category of that name in the project → report and apply both create it': {
			sourceXml,
			targetXml: projectWithoutCategoryXml,
			expected: {
				mapping: { create: { name: 'MEASUREMENT' } },
				reason: 'none',
				ambiguous: false,
				announcedNew: { FunctionCategory: 1, SubCategory: 0, FunctionCatRef: 1 },
				categoryNames: ['MEASUREMENT'],
				subCategories: 0,
				classifiedUnder: ['MEASUREMENT'],
			},
		},
		'two categories of that name in the project → neither is picked: the consumer has to choose, apply refuses until then':
			{
				sourceXml,
				targetXml: projectWithTwoCategoriesXml,
				expected: {
					mapping: undefined,
					reason: 'name',
					ambiguous: true,
					applyRefusal: 'not decided',
					announcedNew: { FunctionCategory: 1, SubCategory: 0, FunctionCatRef: 1 },
					categoryNames: ['MEASUREMENT', 'MEASUREMENT'],
					subCategories: 0,
					classifiedUnder: [],
				},
			},
		'… and the consumer has a new one created → the report asks for its name, apply creates it under a free one':
			{
				sourceXml,
				targetXml: projectWithTwoCategoriesXml,
				chosen: [['category-s', { create: {} }]],
				expected: {
					mapping: { create: { name: 'MEASUREMENT' } },
					reason: 'decision',
					ambiguous: false,
					announcedNew: { FunctionCategory: 1, SubCategory: 0, FunctionCatRef: 1 },
					categoryNames: ['MEASUREMENT', 'MEASUREMENT', 'MEASUREMENT_1'],
					subCategories: 0,
					classifiedUnder: ['MEASUREMENT_1'],
				},
			},
		'the consumer picks another category of the project → report and apply both map onto that one':
			{
				sourceXml,
				targetXml: projectWithOtherCategoryXml,
				chosen: [['category-s', { existing: projectProtectionRef }]],
				expected: {
					mapping: { existing: projectProtectionRef },
					reason: 'decision',
					ambiguous: false,
					announcedNew: { FunctionCategory: 0, SubCategory: 0, FunctionCatRef: 1 },
					categoryNames: ['MEASUREMENT', 'PROTECTION'],
					subCategories: 0,
					classifiedUnder: ['PROTECTION'],
					projectCategoryClassifies: ['S1/V1/B1/Local'],
				},
			},
		'the consumer wants a new category although one of that name exists → the report asks for its name, apply creates it under a free one':
			{
				sourceXml,
				targetXml: projectXml,
				chosen: [['category-s', { create: {} }]],
				expected: {
					mapping: { create: { name: 'MEASUREMENT' } },
					reason: 'decision',
					ambiguous: false,
					announcedNew: { FunctionCategory: 1, SubCategory: 0, FunctionCatRef: 1 },
					categoryNames: ['MEASUREMENT', 'MEASUREMENT_1'],
					subCategories: 0,
					classifiedUnder: ['MEASUREMENT_1'],
					projectCategoryClassifies: ['S1/V1/B1/Local'],
				},
			},
		'the consumer names the new category → both create it under that name': {
			sourceXml,
			targetXml: projectXml,
			chosen: [['category-s', { create: { name: 'METERING' } }]],
			expected: {
				mapping: { create: { name: 'METERING' } },
				reason: 'decision',
				ambiguous: false,
				announcedNew: { FunctionCategory: 1, SubCategory: 0, FunctionCatRef: 1 },
				categoryNames: ['MEASUREMENT', 'METERING'],
				subCategories: 0,
				classifiedUnder: ['METERING'],
				projectCategoryClassifies: ['S1/V1/B1/Local'],
			},
		},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		const lifecycleTarget = {
			verb: 'fsd' as const,
			scenario: 'instantiate' as const,
			sourceQuery: source.query,
			ref: functionRef,
			anchor: bayRef,
		}
		const decisionMappings = new Map(testCase.chosen ?? [])

		const reported = await report(target.query, {
			...lifecycleTarget,
			resolution: { mappings: decisionMappings },
		})
		const categoryMapping = reported.mappings.find((mapping) => mapping.id === 'category-s')
		expect(categoryMapping?.mapping, 'report').toEqual(testCase.expected.mapping)
		expect(categoryMapping?.reason, 'report').toBe(testCase.expected.reason)
		expect(categoryMapping?.ambiguous, 'report').toBe(testCase.expected.ambiguous)

		// a node may be reached through its own group and through its parent's: count it once
		const announced = [
			...new Set(
				allGroups(reported).flatMap((group) =>
					[group.primary, ...group.companions].flatMap(flattenNodes),
				),
			),
		]
		const countNew = (tagName: string): number =>
			announced.filter((node) => node.tagName === tagName && node.change === 'added').length
		expect(
			{
				FunctionCategory: countNew('FunctionCategory'),
				SubCategory: countNew('SubCategory'),
				FunctionCatRef: countNew('FunctionCatRef'),
			},
			'report',
		).toEqual(testCase.expected.announcedNew)

		if (testCase.expected.applyRefusal) {
			expect(reported.needsDecisions, 'report').toBe(true)
			const refused = target.transaction(async (tx) => {
				await apply(tx, {
					...lifecycleTarget,
					report: reported,
					resolution: { decisions: new Map(), mappings: decisionMappings },
				})
			})
			await expect(refused).rejects.toThrow(testCase.expected.applyRefusal)
			return
		}

		await target.transaction(async (tx) => {
			await apply(tx, {
				...lifecycleTarget,
				report: reported,
				resolution: { decisions: new Map(), mappings: decisionMappings },
			})
		})

		const categories = await target.query.getRecordsByTagName('FunctionCategory')
		const categoryNames: string[] = []
		for (const category of categories) {
			const name = await target.query.getAttribute(category, { name: 'name' })
			categoryNames.push(name ?? '')
		}
		expect(categoryNames.sort(), 'apply').toEqual(testCase.expected.categoryNames)

		const subCategories = await target.query.getRecordsByTagName('SubCategory')
		expect(subCategories.length, 'apply').toBe(testCase.expected.subCategories)

		// the containers holding the reference to the instantiated function, outermost first
		const [functionInstance] = await target.query.findByAttributes({
			tagName: 'Function',
			attributes: { templateUuid: 'function-source-uuid' },
		})
		const functionInstanceUuid = await target.query.getAttribute(functionInstance, { name: 'uuid' })
		const [classification] = await target.query.findByAttributes({
			tagName: 'FunctionCatRef',
			attributes: { functionUuid: functionInstanceUuid },
		})
		const containers = await target.query.any.findAncestors(classification)
		const classifiedUnder: string[] = []
		for (const container of containers) {
			if (container.tagName !== 'FunctionCategory' && container.tagName !== 'SubCategory') continue
			const name = await target.query.any.getAttribute(container, { name: 'name' })
			classifiedUnder.unshift(name ?? '')
		}
		expect(classifiedUnder, 'apply').toEqual(testCase.expected.classifiedUnder)

		if (testCase.expected.projectCategoryClassifies) {
			const description = await target.query.getAttribute(projectCategoryRef, { name: 'desc' })
			expect(description, 'apply').toBe('Project measurements')

			const { FunctionCatRef: classifications = [] } = await target.query.findDescendants(
				projectCategoryRef,
				{ collect: 'FunctionCatRef' },
			)
			const classifies: string[] = []
			for (const reference of classifications) {
				const functionPath = await target.query.getAttribute(reference, { name: 'function' })
				classifies.push(functionPath ?? '')
			}
			expect(classifies.sort(), 'apply').toEqual(testCase.expected.projectCategoryClassifies)
		}

		// whatever the category landed on, every reference of the project points at a project element
		const appliedXml = (await target.query.getSnapshot({ as: 'xml' })) as string
		expect(collectReferenceViolations({ xml: appliedXml }), 'apply').toEqual([])
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type UpdateTestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** What the template's author changes between the instantiate and the update. */
	editTemplate: (tx: Scl.Transaction) => Promise<void>
	/** What the project's author changes between the instantiate and the update. */
	editProject?: (tx: Scl.Transaction) => Promise<void>
	/** Place the template a second time instead of updating its instance. */
	instantiateAgain?: boolean
	expected: {
		/** Where the update's report says the source category lands — nothing when the template brings none. */
		mapping: DecisionMapping | undefined
		reason: MappingReason | undefined
		locked: boolean | undefined
		/** What the update's report announces, by change then tag. */
		announced: {
			added: { FunctionCategory: number; SubCategory: number; FunctionCatRef: number }
			removed: { FunctionCategory: number; SubCategory: number; FunctionCatRef: number }
		}
		/** Names of every FunctionCategory of the project, once updated. */
		categoryNames: string[]
		/** Names of every SubCategory of the project, once updated. */
		subCategoryNames: string[]
		/** The description of the category "MEASUREMENT", once updated. */
		categoryDescription: string | undefined
		/** Every classification of the project once updated: `container path -> function path`. */
		classifications: string[]
	}
}

const sourceCategoryRef = {
	tagName: 'FunctionCategory',
	id: 'category-s',
} as Scl.Ref<'FunctionCategory'>

/** Stands, in an expected mapping, for the category the instantiate created. */
const createdCategoryRef = {
	tagName: 'FunctionCategory',
	id: '<created>',
} as Scl.Ref<'FunctionCategory'>

/** The template drops the category altogether: the function is no longer classified. */
const dropClassification = async (tx: Scl.Transaction): Promise<void> => {
	await tx.delete(sourceCategoryRef)
	await tx.update(functionRef, { attributes: { desc: 'revision 2' } })
}

const describeFunctionRevision = async (tx: Scl.Transaction): Promise<void> => {
	await tx.update(functionRef, { attributes: { desc: 'revision 2' } })
}

describe('shared-element mapping — an update finds the category the instantiate mapped', () => {
	const testCases: SclTest.TestCases<UpdateTestCase> = {
		'the category was mapped onto a project category → the update lists it as mapped there, locked, and leaves it as it is':
			{
				sourceXml,
				targetXml: projectXml,
				editTemplate: describeFunctionRevision,
				expected: {
					mapping: { existing: projectCategoryRef },
					reason: 'lineage',
					locked: true,
					announced: {
						added: { FunctionCategory: 0, SubCategory: 0, FunctionCatRef: 0 },
						removed: { FunctionCategory: 0, SubCategory: 0, FunctionCatRef: 0 },
					},
					categoryNames: ['MEASUREMENT'],
					subCategoryNames: [],
					categoryDescription: 'Project measurements',
					classifications: ['MEASUREMENT -> S1/V1/B1/Local', 'MEASUREMENT -> S1/V1/B1/Prot'],
				},
			},
		'the template no longer classifies the function → its reference leaves the project category, which keeps its own':
			{
				sourceXml,
				targetXml: projectXml,
				editTemplate: dropClassification,
				expected: {
					mapping: undefined,
					reason: undefined,
					locked: undefined,
					announced: {
						added: { FunctionCategory: 0, SubCategory: 0, FunctionCatRef: 0 },
						removed: { FunctionCategory: 0, SubCategory: 0, FunctionCatRef: 1 },
					},
					categoryNames: ['MEASUREMENT'],
					subCategoryNames: [],
					categoryDescription: 'Project measurements',
					classifications: ['MEASUREMENT -> S1/V1/B1/Local'],
				},
			},
		'… and when the reference sat in a sub-category of the project category → it leaves that sub-category, which stays':
			{
				sourceXml: nestedSourceXml,
				targetXml: nestedProjectXml,
				editTemplate: dropClassification,
				expected: {
					mapping: undefined,
					reason: undefined,
					locked: undefined,
					announced: {
						added: { FunctionCategory: 0, SubCategory: 0, FunctionCatRef: 0 },
						removed: { FunctionCategory: 0, SubCategory: 0, FunctionCatRef: 1 },
					},
					categoryNames: ['MEASUREMENT'],
					subCategoryNames: ['CURRENT'],
					categoryDescription: 'Project measurements',
					classifications: ['MEASUREMENT/CURRENT -> S1/V1/B1/Local'],
				},
			},
		'the template classifies the function under one more sub-category → it is added to the project category, beside what that category already holds':
			{
				sourceXml: nestedSourceXml,
				targetXml: nestedProjectXml,
				editTemplate: async (tx) => {
					const subCategory = await tx.addChild(sourceCategoryRef, {
						tagName: 'SubCategory',
						attributes: { name: 'VOLTAGE', uuid: 'voltage-source-uuid' },
					})
					await tx.addChild(subCategory, {
						tagName: 'FunctionCatRef',
						attributes: {
							function: 'TEMPLATE/TEMPLATE/TEMPLATE/Prot',
							functionUuid: 'function-source-uuid',
						},
					})
					await describeFunctionRevision(tx)
				},
				expected: {
					mapping: { existing: projectCategoryRef },
					reason: 'lineage',
					locked: true,
					announced: {
						added: { FunctionCategory: 0, SubCategory: 1, FunctionCatRef: 1 },
						removed: { FunctionCategory: 0, SubCategory: 0, FunctionCatRef: 0 },
					},
					categoryNames: ['MEASUREMENT'],
					subCategoryNames: ['CURRENT', 'VOLTAGE'],
					categoryDescription: 'Project measurements',
					classifications: [
						'MEASUREMENT/CURRENT -> S1/V1/B1/Local',
						'MEASUREMENT/CURRENT -> S1/V1/B1/Prot',
						'MEASUREMENT/VOLTAGE -> S1/V1/B1/Prot',
					],
				},
			},
		'the category was created by the instantiate → the update finds it by its lineage and reconciles it in full, description included':
			{
				sourceXml,
				targetXml: projectWithoutCategoryXml,
				editTemplate: async (tx) => {
					await tx.update(sourceCategoryRef, { attributes: { desc: 'Measurements, revision 2' } })
				},
				expected: {
					mapping: { existing: createdCategoryRef },
					reason: 'lineage',
					locked: true,
					announced: {
						added: { FunctionCategory: 0, SubCategory: 0, FunctionCatRef: 0 },
						removed: { FunctionCategory: 0, SubCategory: 0, FunctionCatRef: 0 },
					},
					categoryNames: ['MEASUREMENT'],
					subCategoryNames: [],
					categoryDescription: 'Measurements, revision 2',
					classifications: ['MEASUREMENT -> S1/V1/B1/Prot'],
				},
			},
		'the category and its sub-category were created by a first instantiate, the sub-category renamed since → a second instantiate lands in them, nothing is duplicated':
			{
				sourceXml: nestedSourceXml,
				targetXml: projectWithoutCategoryXml,
				instantiateAgain: true,
				editProject: async (tx) => {
					const [createdSubCategory] = await tx.getRecordsByTagName('SubCategory')
					await tx.update(createdSubCategory, { attributes: { name: 'CURRENT_A' } })
				},
				editTemplate: async () => {},
				expected: {
					mapping: { existing: createdCategoryRef },
					reason: 'lineage',
					locked: false,
					announced: {
						added: { FunctionCategory: 0, SubCategory: 0, FunctionCatRef: 1 },
						removed: { FunctionCategory: 0, SubCategory: 0, FunctionCatRef: 0 },
					},
					categoryNames: ['MEASUREMENT'],
					subCategoryNames: ['CURRENT_A'],
					categoryDescription: undefined,
					classifications: [
						'MEASUREMENT/CURRENT_A -> S1/V1/B1/Prot',
						'MEASUREMENT/CURRENT_A -> S1/V1/B1/Prot_1',
					],
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
			ref: functionRef,
			anchor: bayRef,
		}

		const categoriesAtStart = await target.query.getRecordsByTagName('FunctionCategory')
		const categoryIdsAtStart = new Set(categoriesAtStart.map((category) => category.id))

		// 1. first instantiate
		const instantiateReport = await report(target.query, {
			...lifecycleTarget,
			scenario: 'instantiate',
		})
		await target.transaction(async (tx) => {
			await apply(tx, {
				...lifecycleTarget,
				scenario: 'instantiate',
				report: instantiateReport,
				resolution: { decisions: new Map() },
			})
		})

		// 2. both sides move on
		if (testCase.editProject) await target.transaction(testCase.editProject)
		await source.transaction(testCase.editTemplate)

		// 3. the update — or a second placement
		const updateTarget = {
			...lifecycleTarget,
			scenario: testCase.instantiateAgain ? ('instantiate' as const) : ('template' as const),
		}
		const updateReport = await report(target.query, updateTarget)
		const categoryMapping = updateReport.mappings.find((mapping) => mapping.id === 'category-s')
		const reportedMapping = categoryMapping?.mapping
		const namedMapping =
			reportedMapping && 'existing' in reportedMapping
				? {
						existing: categoryIdsAtStart.has(reportedMapping.existing.id ?? '')
							? reportedMapping.existing
							: createdCategoryRef,
					}
				: reportedMapping
		expect(namedMapping, 'report').toEqual(testCase.expected.mapping)
		expect(categoryMapping?.reason, 'report').toBe(testCase.expected.reason)
		expect(categoryMapping?.locked, 'report').toBe(testCase.expected.locked)

		// a node may be reached through its own group and through its parent's: count it once
		const announced = [
			...new Set(
				allGroups(updateReport).flatMap((group) =>
					[group.primary, ...group.companions].flatMap(flattenNodes),
				),
			),
		]
		const count = (change: DiffNode['change']) => (tagName: string) =>
			announced.filter((node) => node.tagName === tagName && node.change === change).length
		const countAdded = count('added')
		const countRemoved = count('removed')
		expect(
			{
				added: {
					FunctionCategory: countAdded('FunctionCategory'),
					SubCategory: countAdded('SubCategory'),
					FunctionCatRef: countAdded('FunctionCatRef'),
				},
				removed: {
					FunctionCategory: countRemoved('FunctionCategory'),
					SubCategory: countRemoved('SubCategory'),
					FunctionCatRef: countRemoved('FunctionCatRef'),
				},
			},
			'report',
		).toEqual(testCase.expected.announced)

		await target.transaction(async (tx) => {
			await apply(tx, {
				...updateTarget,
				report: updateReport,
				resolution: { decisions: new Map() },
			})
		})

		const namesOf = async (tagName: 'FunctionCategory' | 'SubCategory'): Promise<string[]> => {
			const records = await target.query.getRecordsByTagName(tagName)
			const names: string[] = []
			for (const record of records) {
				const name = await target.query.any.getAttribute(record, { name: 'name' })
				names.push(name ?? '')
			}
			return names.sort()
		}
		expect(await namesOf('FunctionCategory'), 'apply').toEqual(testCase.expected.categoryNames)
		expect(await namesOf('SubCategory'), 'apply').toEqual(testCase.expected.subCategoryNames)

		const [measurement] = await target.query.findByAttributes({
			tagName: 'FunctionCategory',
			attributes: { name: 'MEASUREMENT' },
		})
		const categoryDescription = await target.query.getAttribute(measurement, { name: 'desc' })
		expect(categoryDescription || undefined, 'apply').toBe(testCase.expected.categoryDescription)

		const references = await target.query.getRecordsByTagName('FunctionCatRef')
		const classifications: string[] = []
		for (const reference of references) {
			const containers = await target.query.any.findAncestors(reference)
			const containerNames: string[] = []
			for (const container of containers) {
				if (container.tagName !== 'FunctionCategory' && container.tagName !== 'SubCategory')
					continue
				const name = await target.query.any.getAttribute(container, { name: 'name' })
				containerNames.unshift(name ?? '')
			}
			const functionPath = await target.query.getAttribute(reference, { name: 'function' })
			classifications.push(`${containerNames.join('/')} -> ${functionPath}`)
		}
		expect(classifications.sort(), 'apply').toEqual(testCase.expected.classifications)

		// whatever the category landed on, every reference of the project points at a project element
		const appliedXml = (await target.query.getSnapshot({ as: 'xml' })) as string
		expect(collectReferenceViolations({ xml: appliedXml }), 'apply').toEqual([])
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// An Application composing the function "Prot" and selecting the category "MEASUREMENT", which
// classifies that function.
const applicationSourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="category-source-uuid" ${id}="category-s">
					<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="category-ref-s"/>
				</eIEC61850-6-100:FunctionCategory>
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-source-uuid" ${id}="application-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="function-content-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="application-function-ref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
						<eIEC61850-6-100:FunctionRoleContent ${id}="category-content-s">
							<eIEC61850-6-100:FunctionCategoryRef functionCategory="TEMPLATE/MEASUREMENT" functionCategoryUuid="category-source-uuid" ${id}="application-category-ref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// The same Application, selecting the sub-category "CURRENT" the function is classified under.
const applicationSubCategorySourceXml = applicationSourceXml
	.replace(
		/<eIEC61850-6-100:FunctionCategory name="MEASUREMENT"[\s\S]*?<\/eIEC61850-6-100:FunctionCategory>/,
		`<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="category-source-uuid" ${id}="category-s">
					<eIEC61850-6-100:SubCategory name="CURRENT" uuid="sub-category-source-uuid" ${id}="sub-category-s">
						<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="category-ref-s"/>
					</eIEC61850-6-100:SubCategory>
				</eIEC61850-6-100:FunctionCategory>`,
	)
	.replace(
		'functionCategory="TEMPLATE/MEASUREMENT" functionCategoryUuid="category-source-uuid"',
		'functionCategory="TEMPLATE/MEASUREMENT/CURRENT" functionCategoryUuid="sub-category-source-uuid"',
	)

const applicationRef = { tagName: 'Application', id: 'application-s' } as Scl.Ref<'Application'>

type ApplicationTestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	expected: {
		/** Where the report says the source category lands — nothing when it is the consumer's to choose. */
		mapping: DecisionMapping | undefined
		/** A fragment of the refusal when apply is run on the report as it is; nothing else is then checked. */
		applyRefusal?: string
		/** What the report announces as new, by tag. */
		announcedNew: { FunctionCategory: number; FunctionCatRef: number }
		/** Names of every FunctionCategory of the project, once applied. */
		categoryNames: string[]
		/** The functions the category the Application selects classifies once applied, by path. */
		selectedCategoryClassifies: string[]
		/** The path the Application's reference to its category carries, once applied. */
		selectedCategoryPath: string
	}
}

describe('shared-element mapping — an application selecting a function category', () => {
	const testCases: SclTest.TestCases<ApplicationTestCase> = {
		'the project holds the category → the review shows it matched with the added reference, and the application refers to it':
			{
				sourceXml: applicationSourceXml,
				targetXml: projectXml,
				expected: {
					mapping: { existing: projectCategoryRef },
					announcedNew: { FunctionCategory: 0, FunctionCatRef: 1 },
					categoryNames: ['MEASUREMENT'],
					selectedCategoryClassifies: ['S1/V1/B1/Local', 'S1/V1/B1/Prot'],
					selectedCategoryPath: 'S1/MEASUREMENT',
				},
			},
		'the application selects a sub-category the project category already has → it refers to the sub-category of the project':
			{
				sourceXml: applicationSubCategorySourceXml,
				targetXml: nestedProjectXml,
				expected: {
					mapping: { existing: projectCategoryRef },
					announcedNew: { FunctionCategory: 0, FunctionCatRef: 1 },
					categoryNames: ['MEASUREMENT'],
					selectedCategoryClassifies: ['S1/V1/B1/Local', 'S1/V1/B1/Prot'],
					selectedCategoryPath: 'S1/MEASUREMENT/CURRENT',
				},
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<ApplicationTestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		const lifecycleTarget = {
			verb: 'asd' as const,
			scenario: 'instantiate' as const,
			sourceQuery: source.query,
			ref: applicationRef,
			anchor: bayRef,
		}

		const reported = await report(target.query, lifecycleTarget)
		const categoryMapping = reported.mappings.find((mapping) => mapping.id === 'category-s')
		expect(categoryMapping?.mapping, 'report').toEqual(testCase.expected.mapping)

		// a node may be reached through its own group and through its parent's: count it once
		const announced = [
			...new Set(
				allGroups(reported).flatMap((group) =>
					[group.primary, ...group.companions].flatMap(flattenNodes),
				),
			),
		]
		const countNew = (tagName: string): number =>
			announced.filter((node) => node.tagName === tagName && node.change === 'added').length
		expect(
			{
				FunctionCategory: countNew('FunctionCategory'),
				FunctionCatRef: countNew('FunctionCatRef'),
			},
			'report',
		).toEqual(testCase.expected.announcedNew)

		await target.transaction(async (tx) => {
			await apply(tx, {
				...lifecycleTarget,
				report: reported,
				resolution: { decisions: new Map() },
			})
		})

		const categories = await target.query.getRecordsByTagName('FunctionCategory')
		const categoryNames: string[] = []
		for (const category of categories) {
			const name = await target.query.getAttribute(category, { name: 'name' })
			categoryNames.push(name ?? '')
		}
		expect(categoryNames.sort(), 'apply').toEqual(testCase.expected.categoryNames)

		const [selection] = await target.query.getRecordsByTagName('FunctionCategoryRef')
		const { functionCategory, functionCategoryUuid } = await target.query.getAttributes(selection)
		expect(functionCategory, 'apply').toBe(testCase.expected.selectedCategoryPath)

		// the category — or sub-category — of the project the Application selects
		const selectedCategories = await target.query.findByAttributes({
			tagName: 'FunctionCategory',
			attributes: { uuid: functionCategoryUuid },
		})
		const selectedSubCategories = await target.query.findByAttributes({
			tagName: 'SubCategory',
			attributes: { uuid: functionCategoryUuid },
		})
		const [selected] = [...selectedCategories, ...selectedSubCategories]
		expect(selected, 'apply: the application selects a category of the project').toBeDefined()
		const selectedTree = await target.query.any.getTree(selected)
		const classifies: string[] = []
		for (const node of selectedTree ? flattenTree(selectedTree) : []) {
			if (node.tagName !== 'FunctionCatRef') continue
			const functionPath = await target.query.any.getAttribute(node, { name: 'function' })
			classifies.push(functionPath ?? '')
		}
		expect(classifies.sort(), 'apply').toEqual(testCase.expected.selectedCategoryClassifies)

		const appliedXml = (await target.query.getSnapshot({ as: 'xml' })) as string
		expect(collectReferenceViolations({ xml: appliedXml }), 'apply').toEqual([])
	}

	runSclTestCases.withoutExport({ testCases, act })
})
