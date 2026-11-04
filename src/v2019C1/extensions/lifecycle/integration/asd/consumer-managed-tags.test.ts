import { findByName, listGroups } from '../integration-helpers'

import { describe, expect, expectTypeOf, it } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleTarget, Resolution } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// A consumer that assigns an application to functions writes its own `FunctionRole` (and `FunctionRoleContent`)
// on the instance, with no lineage of the template. Without `consumerManagedTags` such an element is the
// project's own: listed `target-only`, kept by default. With the tags named, the engine lists nothing for them.

const applicationRef = { tagName: 'Application', id: 'application-s' } as Scl.Ref<'Application'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

/** One revision of the template: the application `HMI` (role `ROOT`) composing `Prot`. */
function templateXml(params: { applicationDesc?: string; roleDesc?: string; withRole?: boolean }) {
	const { applicationDesc = 'rev1', roleDesc = 'rev1', withRole = true } = params
	const role = withRole
		? /* xml */ `
			<eIEC61850-6-100:FunctionRole name="ROOT" desc="${roleDesc}" cardinality="0..n" uuid="role-uuid" ${id}="role-s">
				<eIEC61850-6-100:FunctionRoleContent ${id}="content-s">
					<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-uuid" ${id}="reference-s"/>
				</eIEC61850-6-100:FunctionRoleContent>
			</eIEC61850-6-100:FunctionRole>
		`
		: ''
	return /* xml */ `
		<SCL ${ns} ${id}="template">
			<Substation name="TEMPLATE" ${id}="substation-s">
				<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
					<Bay name="TEMPLATE" uuid="bay-uuid" ${id}="bay-s">
						<Private type="eIEC61850-6-100" ${id}="private-s">
							<eIEC61850-6-100:Application name="HMI" type="DCS" desc="${applicationDesc}" uuid="application-uuid" ${id}="application-s">
								${role}
							</eIEC61850-6-100:Application>
						</Private>
						<Function name="Prot" uuid="function-uuid" ${id}="function-s"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

/**
 * The project holding an instance of that template: matched by lineage (`templateUuid`) as a template update reads
 * it, or by shared uuids as a fork of a newer revision does. `ownContent` is what the consumer added.
 */
function projectXml(params: {
	lineage: 'template' | 'fork'
	/** Elements added to the instance's application, after its roles. */
	applicationContent?: string
	/** Elements added to the content of the instance's role `ROOT`, after its function reference. */
	roleContent?: string
}) {
	const { lineage, applicationContent = '', roleContent = '' } = params
	function uuid(kind: 'application' | 'role' | 'function') {
		return lineage === 'fork'
			? `uuid="${kind}-uuid"`
			: `uuid="${kind}-instance-uuid" templateUuid="${kind}-uuid"`
	}
	return /* xml */ `
		<SCL ${ns} ${id}="project">
			<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
			<Substation name="S1" ${id}="substation-t">
				<VoltageLevel name="V1" ${id}="voltage-level-t">
					<Bay name="B1" ${lineage === 'fork' ? 'uuid="bay-uuid"' : ''} ${id}="bay-t">
						<Private type="eIEC61850-6-100" ${id}="private-t">
							<eIEC61850-6-100:Application name="HMI" type="DCS" desc="rev1" ${uuid('application')} ${id}="application-t">
								<eIEC61850-6-100:FunctionRole name="ROOT" desc="rev1" cardinality="0..n" ${uuid('role')} ${id}="role-t">
									<eIEC61850-6-100:FunctionRoleContent ${id}="content-t">
										<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Prot" functionUuid="${lineage === 'fork' ? 'function-uuid' : 'function-instance-uuid'}" ${id}="reference-t"/>
									</eIEC61850-6-100:FunctionRoleContent>
									${roleContent}
								</eIEC61850-6-100:FunctionRole>
								${applicationContent}
							</eIEC61850-6-100:Application>
						</Private>
						<Function name="Prot" ${uuid('function')} ${id}="function-t"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

/** What a consumer writes: a role of its own, with a content and a reference to the instance's function. */
function consumerRole(params: { lineage: 'template' | 'fork' }) {
	return /* xml */ `
		<eIEC61850-6-100:FunctionRole name="Measurement" uuid="role-consumer-uuid" ${id}="role-c">
			<eIEC61850-6-100:FunctionRoleContent ${id}="content-c">
				<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Prot" functionUuid="${params.lineage === 'fork' ? 'function-uuid' : 'function-instance-uuid'}" ${id}="reference-c"/>
			</eIEC61850-6-100:FunctionRoleContent>
		</eIEC61850-6-100:FunctionRole>
	`
}
/** A second content of the matched role, as the instantiation of a role of cardinality `0..n` creates. */
const secondContent = /* xml */ `<eIEC61850-6-100:FunctionRoleContent roleInst="2" ${id}="content-c"/>`

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The option given to the report and to the apply. Absent: none. */
	consumerManagedTags?: Scl.ElementsOf[]
	/** `fork`: the project holds the previous revision of the same file, no base given. Default: a template update. */
	scenario?: 'template' | 'fork'
	/** `fork` only: the previous revision of the file, given to the report and the apply as their base. */
	baseXml?: string
	/** The groups the report lists, `<change> <tag>`, sorted. */
	groups: string[]
	/** What the consumer wrote, by tag and record id: the apply leaves it as it was. Absent: nothing was added. */
	own?: { tagName: Scl.ElementsOf; id: string }
	/** What the apply leaves in the project, though what it holds may go (a removal takes the references below it). */
	stillThere?: { tagName: Scl.ElementsOf; id: string }
}

describe('lifecycle.report — what a consumer maintains on an instance (consumerManagedTags)', () => {
	const template = templateXml({})
	const asdTags = ['FunctionRole', 'FunctionRoleContent'] as const

	const testCases: SclTest.TestCases<TestCase> = {
		"no option → a role the instance holds without lineage is the project's own: listed target-only":
			{
				sourceXml: template,
				targetXml: projectXml({
					lineage: 'template',
					applicationContent: consumerRole({ lineage: 'template' }),
				}),
				groups: ['target-only FunctionRole'],
				own: { tagName: 'FunctionRole', id: 'role-c' },
			},
		'the tags named → the role is not listed, the instance is up to date and the apply writes nothing':
			{
				sourceXml: template,
				targetXml: projectXml({
					lineage: 'template',
					applicationContent: consumerRole({ lineage: 'template' }),
				}),
				consumerManagedTags: [...asdTags],
				groups: [],
				own: { tagName: 'FunctionRole', id: 'role-c' },
			},
		"the tags named, the template changes the application → only the application's change is listed":
			{
				sourceXml: templateXml({ applicationDesc: 'rev2' }),
				targetXml: projectXml({
					lineage: 'template',
					applicationContent: consumerRole({ lineage: 'template' }),
				}),
				consumerManagedTags: [...asdTags],
				groups: ['modified Application'],
				own: { tagName: 'FunctionRole', id: 'role-c' },
			},
		"the tags named, the template changes its own role beside the consumer's → that role is modified as ever, the consumer's is not listed":
			{
				sourceXml: templateXml({ roleDesc: 'rev2' }),
				targetXml: projectXml({
					lineage: 'template',
					applicationContent: consumerRole({ lineage: 'template' }),
				}),
				consumerManagedTags: [...asdTags],
				groups: ['modified FunctionRole'],
				own: { tagName: 'FunctionRole', id: 'role-c' },
			},
		"no option, the template changes its own role beside the consumer's → both are listed": {
			sourceXml: templateXml({ roleDesc: 'rev2' }),
			targetXml: projectXml({
				lineage: 'template',
				applicationContent: consumerRole({ lineage: 'template' }),
			}),
			groups: ['modified FunctionRole', 'target-only FunctionRole'],
			own: { tagName: 'FunctionRole', id: 'role-c' },
		},
		'no option → a second content the project added to the matched role is listed target-only': {
			sourceXml: template,
			targetXml: projectXml({ lineage: 'template', roleContent: secondContent }),
			groups: ['target-only FunctionRoleContent'],
			own: { tagName: 'FunctionRoleContent', id: 'content-c' },
		},
		'FunctionRoleContent named → that second content is not listed': {
			sourceXml: template,
			targetXml: projectXml({ lineage: 'template', roleContent: secondContent }),
			consumerManagedTags: ['FunctionRoleContent'],
			groups: [],
			own: { tagName: 'FunctionRoleContent', id: 'content-c' },
		},
		'FunctionRole alone named → the second content inside the matched role is still listed (the tags are not inherited)':
			{
				sourceXml: template,
				targetXml: projectXml({ lineage: 'template', roleContent: secondContent }),
				consumerManagedTags: ['FunctionRole'],
				groups: ['target-only FunctionRoleContent'],
				own: { tagName: 'FunctionRoleContent', id: 'content-c' },
			},
		'a fork given no previous revision, no option → a role the project added (its own uuid) is listed target-only':
			{
				sourceXml: template,
				targetXml: projectXml({
					lineage: 'fork',
					applicationContent: consumerRole({ lineage: 'fork' }),
				}),
				scenario: 'fork',
				groups: ['target-only FunctionRole'],
				own: { tagName: 'FunctionRole', id: 'role-c' },
			},
		'a fork given no previous revision, the tags named → a role with a uuid the newer revision lacks is still listed: nothing tells it from one the template dropped':
			{
				sourceXml: template,
				targetXml: projectXml({
					lineage: 'fork',
					applicationContent: consumerRole({ lineage: 'fork' }),
				}),
				scenario: 'fork',
				consumerManagedTags: [...asdTags],
				groups: ['target-only FunctionRole'],
				own: { tagName: 'FunctionRole', id: 'role-c' },
			},
		'a fork given the previous revision, which did not hold the role, the tags named → that role is not listed':
			{
				sourceXml: template,
				targetXml: projectXml({
					lineage: 'fork',
					applicationContent: consumerRole({ lineage: 'fork' }),
				}),
				baseXml: template,
				scenario: 'fork',
				consumerManagedTags: [...asdTags],
				groups: [],
				own: { tagName: 'FunctionRole', id: 'role-c' },
			},
		'a fork given no previous revision, the newer revision drops the role the project holds by its uuid, no option → the role is listed target-only':
			{
				sourceXml: templateXml({ withRole: false }),
				targetXml: projectXml({ lineage: 'fork' }),
				scenario: 'fork',
				groups: ['target-only Function', 'target-only FunctionRole'],
			},
		'a fork given no previous revision, the newer revision drops the role the project holds by its uuid, the tag named → the role is listed as without the option':
			{
				sourceXml: templateXml({ withRole: false }),
				targetXml: projectXml({ lineage: 'fork' }),
				scenario: 'fork',
				consumerManagedTags: ['FunctionRole'],
				groups: ['target-only Function', 'target-only FunctionRole'],
			},
		"the template drops its role, the tags named → the role the template made is still removed, the consumer's is not listed":
			{
				sourceXml: templateXml({ withRole: false }),
				targetXml: projectXml({
					lineage: 'template',
					applicationContent: consumerRole({ lineage: 'template' }),
				}),
				consumerManagedTags: ['FunctionRole'],
				// the dropped role takes the function only it referred to along: the reference below the consumer's role goes with it
				groups: ['removed Function', 'removed FunctionRole'],
				stillThere: { tagName: 'FunctionRole', id: 'role-c' },
			},
	}

	async function act({
		testCase,
		project,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const base = testCase.baseXml
			? await openSclDocument({ project, xml: testCase.baseXml, label: 'previous revision' })
			: undefined

		const resolution: Resolution = {
			decisions: new Map(),
			...(testCase.consumerManagedTags
				? { consumerManagedTags: testCase.consumerManagedTags }
				: {}),
		}
		const common = {
			verb: 'asd' as const,
			sourceQuery: source.query,
			ref: applicationRef,
			anchor: bayRef,
		}
		const lifecycle: LifecycleTarget =
			testCase.scenario === 'fork'
				? { ...common, scenario: 'fork', ...(base ? { baseQuery: base.query } : {}) }
				: { ...common, scenario: 'template' }
		const before = testCase.own
			? await target.query.getTree(testCase.own as Scl.Ref<Scl.ElementsOf>)
			: undefined

		const reported = await report(target.query, { ...lifecycle, resolution })
		expect(listGroups(reported), 'report').toEqual(testCase.groups)
		expect(reported.needsDecisions, 'report').toBe(testCase.groups.length > 0)

		await target.transaction(async (tx) => {
			await apply(tx, { ...lifecycle, report: reported, resolution })
		})
		if (testCase.own) {
			// the project's own element is kept as it was, whether the report listed it or not
			const after = await target.query.getTree(testCase.own as Scl.Ref<Scl.ElementsOf>)
			expect(after, 'apply').toEqual(before)
		}
		if (testCase.stillThere) {
			const { tagName, id: recordId } = testCase.stillThere
			const held = await target.query.getRecordsByTagName(tagName)
			expect(
				held.map((record) => record.id),
				'apply',
			).toContain(recordId)
		}
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('lifecycle.report — consumerManagedTags on a topology template (ssd)', () => {
	const ssdTemplate = /* xml */ `
		<SCL ${ns} ${id}="template">
			<Substation name="TEMPLATE" ${id}="substation-s">
				<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
					<Bay name="BAY1" uuid="bay-uuid" ${id}="bay-s">
						<Private type="eIEC61850-6-100" ${id}="private-s">
							<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-uuid" ${id}="application-s">
								<eIEC61850-6-100:FunctionRole name="ROOT" uuid="role-uuid" ${id}="role-s">
									<eIEC61850-6-100:FunctionRoleContent ${id}="content-s">
										<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/BAY1/Prot" functionUuid="function-uuid" ${id}="reference-s"/>
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Private>
						<Function name="Prot" uuid="function-uuid" ${id}="function-s"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
	const emptyProject = /* xml */ `
		<SCL ${ns} ${id}="project">
			<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
			<Substation name="S1" ${id}="substation-t">
				<VoltageLevel name="V1" ${id}="voltage-level-t"/>
			</Substation>
		</SCL>
	`
	type SsdTestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		consumerManagedTags?: Scl.ElementsOf[]
		groups: string[]
	}

	const testCases: SclTest.TestCases<SsdTestCase> = {
		"no option → a role the placed application holds without lineage is listed target-only in the unit's update":
			{
				sourceXml: ssdTemplate,
				targetXml: emptyProject,
				groups: ['target-only FunctionRole'],
			},
		'the tags named → that role is not listed in the unit’s update': {
			sourceXml: ssdTemplate,
			targetXml: emptyProject,
			consumerManagedTags: ['FunctionRole', 'FunctionRoleContent'],
			groups: [],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<SsdTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const bay = await findByName(source.query, { tagName: 'Bay', name: 'BAY1' })
		const lifecycle = {
			verb: 'ssd' as const,
			sourceQuery: source.query,
			ref: bay,
			anchor: { tagName: 'VoltageLevel', id: 'voltage-level-t' } as Scl.Ref<'VoltageLevel'>,
		}

		// 1. the unit placed
		const placed = await report(target.query, { ...lifecycle, scenario: 'instantiate' })
		await target.transaction(async (tx) => {
			await apply(tx, { ...lifecycle, scenario: 'instantiate', report: placed })
		})

		// 2. the consumer writes a role of its own in the placed application
		const instance = await findByName(target.query, { tagName: 'Application', name: 'HMI' })
		await target.transaction(async (tx) => {
			const role = await tx.addChild(instance, {
				tagName: 'FunctionRole',
				attributes: { name: 'Measurement', uuid: 'role-consumer-uuid' },
			})
			await tx.addChild(role, { tagName: 'FunctionRoleContent', attributes: {} })
		})

		// 3. the update of the unit from the same template
		const resolution: Resolution = { consumerManagedTags: testCase.consumerManagedTags }
		const updated = await report(target.query, { ...lifecycle, scenario: 'template', resolution })
		expect(listGroups(updated), 'report').toEqual(testCase.groups)
		expect(allGroups(updated).length > 0, 'report').toBe(testCase.groups.length > 0)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('lifecycle.report — consumerManagedTags on a level the newer topology template dropped (ssd)', () => {
	// a level of the unit carries the lineage of the template it was made from: the tag a consumer manages never
	// hides it, the report lists it as it does with no option
	const levelTemplate = /* xml */ `
		<SCL ${ns} ${id}="template">
			<Substation name="TEMPLATE" ${id}="substation-s">
				<VoltageLevel name="HV" uuid="level-uuid" ${id}="level-s">
					<Bay name="Coupler" uuid="coupler-uuid" ${id}="coupler-s"/>
					<Bay name="Busbar" uuid="busbar-uuid" ${id}="busbar-s"/>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
	const emptySubstation = /* xml */ `
		<SCL ${ns} ${id}="project">
			<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
			<Substation name="S1" ${id}="substation-t"/>
		</SCL>
	`
	type LevelTestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		consumerManagedTags?: Scl.ElementsOf[]
		groups: string[]
	}

	const testCases: SclTest.TestCases<LevelTestCase> = {
		'the newer level template drops its bay, no option → the bay is listed target-only': {
			sourceXml: levelTemplate,
			targetXml: emptySubstation,
			groups: ['target-only Bay'],
		},
		'the newer level template drops its bay, Bay named → the bay is listed as without the option': {
			sourceXml: levelTemplate,
			targetXml: emptySubstation,
			consumerManagedTags: ['Bay'],
			groups: ['target-only Bay'],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<LevelTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const level = await findByName(source.query, { tagName: 'VoltageLevel', name: 'HV' })
		const lifecycle = {
			verb: 'ssd' as const,
			sourceQuery: source.query,
			ref: level,
			anchor: { tagName: 'Substation', id: 'substation-t' } as Scl.Ref<'Substation'>,
		}

		// 1. the level placed
		const placed = await report(target.query, { ...lifecycle, scenario: 'instantiate' })
		await target.transaction(async (tx) => {
			await apply(tx, { ...lifecycle, scenario: 'instantiate', report: placed })
		})

		// 2. the newer revision of the template drops a bay
		await source.transaction(async (tx) => {
			await tx.delete({ tagName: 'Bay', id: 'coupler-s' } as Scl.Ref<'Bay'>)
		})

		// 3. the update of the level from the newer revision
		const resolution: Resolution = { consumerManagedTags: testCase.consumerManagedTags }
		const updated = await report(target.query, { ...lifecycle, scenario: 'template', resolution })
		expect(listGroups(updated), 'report').toEqual(testCase.groups)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('Resolution.consumerManagedTags', () => {
	it('is typed by the tags of the schema', () => {
		expectTypeOf<Resolution['consumerManagedTags']>().toEqualTypeOf<
			readonly Scl.ElementsOf[] | undefined
		>()
		// @ts-expect-error a name outside the schema is no tag
		const unknown: Resolution = { consumerManagedTags: ['NotATag'] }
		expect(unknown.consumerManagedTags, 'resolution').toEqual(['NotATag'])
	})
})
