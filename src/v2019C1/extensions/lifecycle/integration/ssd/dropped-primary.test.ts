import { listGroups, reportAndApply } from '../integration-helpers'

import { describe, expect, it } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type {
	LifecycleScenario,
	LifecycleTarget,
} from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The scenario the template is placed with, then updated with. */
	placedWith: LifecycleScenario
	updatedWith: LifecycleScenario
	/** The update is given the first revision as its base. */
	withBase?: boolean
	/** What the project adds before the update: another application of its own, composing a function. */
	editProject?: (tx: Scl.Transaction) => Promise<void>
	/** The groups of the update's report, `<change> <tag>`, sorted. */
	expectedGroups: string[]
}

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level"/>
		</Substation>
	</SCL>
`

/** A bay template whose `Display` application composes `Ctrl`, beside `HMI` composing `Prot`. */
const bayTemplate = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Header id="feeder" uuid="feeder-file-uuid" version="0" revision="1" ${id}="source-header"/>
		<Substation name="TEMPLATE" ${id}="source-substation">
			<VoltageLevel name="TEMPLATE" ${id}="source-voltage-level">
				<Bay name="Feeder" uuid="feeder-uuid" ${id}="source-feeder">
					<Private type="eIEC61850-6-100" ${id}="source-feeder-private">
						<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="hmi-uuid" ${id}="source-hmi">
							<eIEC61850-6-100:FunctionRole name="ROOT" uuid="hmi-role-uuid" ${id}="source-hmi-role">
								<eIEC61850-6-100:FunctionRoleContent ${id}="source-hmi-content">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/Feeder/Prot" functionUuid="prot-uuid" ${id}="source-hmi-ref"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
						<eIEC61850-6-100:Application name="Display" type="DCS" uuid="display-uuid" ${id}="source-display">
							<eIEC61850-6-100:FunctionRole name="ROOT" uuid="display-role-uuid" ${id}="source-display-role">
								<eIEC61850-6-100:FunctionRoleContent ${id}="source-display-content">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/Feeder/Ctrl" functionUuid="ctrl-uuid" ${id}="source-display-ref"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
					</Private>
					<Function name="Prot" uuid="prot-uuid" ${id}="source-prot"/>
					<Function name="Ctrl" uuid="ctrl-uuid" ${id}="source-ctrl"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** The next revision drops `Display` and the function only it composed. */
async function dropDisplay(tx: Scl.Transaction): Promise<void> {
	await tx.delete({ tagName: 'Application', id: 'source-display' } as Scl.Ref<'Application'>)
	await tx.delete({ tagName: 'Function', id: 'source-ctrl' } as Scl.Ref<'Function'>)
}

/** The project's own application, in the placed bay, composing the function the template drops. */
async function composeCtrlElsewhere(tx: Scl.Transaction): Promise<void> {
	const [ctrl] = await tx.any.findByAttributes({
		tagName: 'Function',
		attributes: { name: 'Ctrl' },
	})
	const [hmi] = await tx.any.findByAttributes({
		tagName: 'Application',
		attributes: { name: 'HMI' },
	})
	if (!ctrl || !hmi?.parent) throw new Error('the placed bay holds Ctrl and HMI')
	const ctrlUuid = await tx.any.getAttribute(ctrl, { name: 'uuid' })
	const application = await tx.any.addChild(hmi.parent, {
		tagName: 'Application',
		namespace: hmi.namespace,
		attributes: { name: 'Operator', uuid: 'operator-uuid' },
	})
	const role = await tx.any.addChild(application, {
		tagName: 'FunctionRole',
		namespace: hmi.namespace,
		attributes: { name: 'ROOT', uuid: 'operator-role-uuid' },
	})
	const content = await tx.any.addChild(role, {
		tagName: 'FunctionRoleContent',
		namespace: hmi.namespace,
		attributes: {},
	})
	await tx.any.addChild(content, {
		tagName: 'FunctionRef',
		namespace: hmi.namespace,
		attributes: { functionUuid: ctrlUuid ?? '' },
	})
}

describe('ssd update: the applications and functions the newer template dropped', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'an application and the function only it composed are listed removed, and removed': {
			sourceXml: bayTemplate,
			targetXml: projectXml,
			placedWith: 'instantiate',
			updatedWith: 'template',
			expectedGroups: ['removed Application', 'removed Function'],
			expectedQueries: [
				'//v2019C1:Application[@templateUuid="hmi-uuid"]',
				'//default:Function[@templateUuid="prot-uuid"]',
			],
			unexpectedQueries: [
				'//v2019C1:Application[@templateUuid="display-uuid"]',
				'//default:Function[@templateUuid="ctrl-uuid"]',
			],
		},
		'a function another application of the project still composes is kept, and not listed': {
			sourceXml: bayTemplate,
			targetXml: projectXml,
			placedWith: 'instantiate',
			updatedWith: 'template',
			editProject: composeCtrlElsewhere,
			expectedGroups: ['removed Application'],
			expectedQueries: [
				'//default:Function[@templateUuid="ctrl-uuid"]',
				'//v2019C1:Application[@name="Operator"]',
			],
			unexpectedQueries: ['//v2019C1:Application[@templateUuid="display-uuid"]'],
		},
		'a fork given the previous revision removes what that revision held and the newer one dropped':
			{
				sourceXml: bayTemplate,
				targetXml: projectXml,
				placedWith: 'fork',
				updatedWith: 'fork',
				withBase: true,
				expectedGroups: ['removed Application', 'removed Function'],
				expectedQueries: ['//v2019C1:Application[@uuid="hmi-uuid"]'],
				unexpectedQueries: [
					'//v2019C1:Application[@uuid="display-uuid"]',
					'//default:Function[@uuid="ctrl-uuid"]',
				],
			},
		'a fork given the previous revision keeps a function an application the project added still composes':
			{
				sourceXml: bayTemplate,
				targetXml: projectXml,
				placedWith: 'fork',
				updatedWith: 'fork',
				withBase: true,
				editProject: composeCtrlElsewhere,
				expectedGroups: ['removed Application', 'target-only Application'],
				expectedQueries: [
					'//default:Function[@uuid="ctrl-uuid"]',
					'//v2019C1:Application[@name="Operator"]',
				],
				unexpectedQueries: ['//v2019C1:Application[@uuid="display-uuid"]'],
			},
		"a fork without it lists them as the project's own and keeps them": {
			sourceXml: bayTemplate,
			targetXml: projectXml,
			placedWith: 'fork',
			updatedWith: 'fork',
			expectedGroups: ['target-only Application', 'target-only Function'],
			expectedQueries: [
				'//v2019C1:Application[@uuid="display-uuid"]',
				'//default:Function[@uuid="ctrl-uuid"]',
			],
		},
	}

	async function act({
		testCase,
		project,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const base = testCase.withBase
			? await openSclDocument({ project, xml: bayTemplate, label: 'previous revision' })
			: undefined
		const lifecycle = (scenario: LifecycleScenario, baseQuery?: Scl.Query): LifecycleTarget =>
			({
				verb: 'ssd',
				sourceQuery: source.query,
				ref: { tagName: 'Bay', id: 'source-feeder' },
				anchor: { tagName: 'VoltageLevel', id: 'project-voltage-level' },
				scenario,
				...(baseQuery ? { baseQuery } : {}),
			}) as LifecycleTarget

		await reportAndApply({ document: target, lifecycle: lifecycle(testCase.placedWith) })
		if (testCase.editProject) await target.transaction(testCase.editProject)
		await source.transaction(dropDisplay)
		const { report } = await reportAndApply({
			document: target,
			lifecycle: lifecycle(testCase.updatedWith, base?.query),
		})

		expect(listGroups(report)).toEqual(testCase.expectedGroups)
		// the function goes after the application composing it
		const groups = allGroups(report)
		const functionRemoval = groups.find((group) => group.primary.tagName === 'Function')
		const applicationRemoval = groups.find((group) => group.primary.tagName === 'Application')
		if (functionRemoval && applicationRemoval) {
			expect(functionRemoval.dependsOn).toEqual([applicationRemoval.id])
		}
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** A voltage level template: its own bay with an application, nothing else. */
const voltageLevelTemplate = /* xml */ `
	<SCL ${ns} ${id}="level-template">
		<Header id="level" uuid="level-file-uuid" version="0" revision="1" ${id}="level-header"/>
		<Substation name="TEMPLATE" ${id}="level-substation">
			<VoltageLevel name="HV" uuid="level-uuid" ${id}="level-voltage-level">
				<Bay name="Coupler" uuid="coupler-uuid" ${id}="level-coupler">
					<Private type="eIEC61850-6-100" ${id}="level-coupler-private">
						<eIEC61850-6-100:Application name="Coupling" type="DCS" uuid="coupling-uuid" ${id}="level-coupling"/>
					</Private>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe("ssd update: what another template placed in the unit is not the unit's", () => {
	it("a bay-typical placed in the voltage level a template placed: its application and function are not listed on that template's update", async () => {
		const { project, source, target } = await createSclTestProject({
			sourceXml: voltageLevelTemplate,
			targetXml: projectXml.replace('<VoltageLevel name="V1" ${id}="project-voltage-level"/>', ''),
		})
		if (!target) throw new Error('target required')
		const bayTypical = await openSclDocument({ project, xml: bayTemplate, label: 'bay typical' })
		const levelLifecycle = (scenario: 'instantiate' | 'template'): LifecycleTarget => ({
			verb: 'ssd',
			sourceQuery: source.document.query,
			ref: { tagName: 'VoltageLevel', id: 'level-voltage-level' },
			anchor: { tagName: 'Substation', id: 'project-substation' },
			scenario,
		})
		await reportAndApply({ document: target.document, lifecycle: levelLifecycle('instantiate') })
		const [placedLevel] = await target.document.query.getRecordsByTagName('VoltageLevel')
		await reportAndApply({
			document: target.document,
			lifecycle: {
				verb: 'ssd',
				sourceQuery: bayTypical.query,
				ref: { tagName: 'Bay', id: 'source-feeder' },
				anchor: { tagName: 'VoltageLevel', id: placedLevel.id },
				scenario: 'instantiate',
			},
		})

		const reported = await report(target.document.query, levelLifecycle('template'))
		// the bay-typical's application and function are not the level template's to drop
		const primaryGroups = listGroups(reported).filter((group) =>
			/ (Application|Function)$/.test(group),
		)
		expect(primaryGroups).toEqual([])
	})
})

describe('ssd update: what the unit dropped on a level below its root', () => {
	it('an application a bay of the voltage level template held is listed removed, and removed', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml: voltageLevelTemplate,
			targetXml: projectXml.replace('<VoltageLevel name="V1" ${id}="project-voltage-level"/>', ''),
		})
		if (!target) throw new Error('target required')
		const levelLifecycle = (scenario: 'instantiate' | 'template'): LifecycleTarget => ({
			verb: 'ssd',
			sourceQuery: source.document.query,
			ref: { tagName: 'VoltageLevel', id: 'level-voltage-level' },
			anchor: { tagName: 'Substation', id: 'project-substation' },
			scenario,
		})
		await reportAndApply({ document: target.document, lifecycle: levelLifecycle('instantiate') })
		await source.document.transaction(async (tx) => {
			await tx.delete({ tagName: 'Application', id: 'level-coupling' } as Scl.Ref<'Application'>)
		})

		const { report: updateReport } = await reportAndApply({
			document: target.document,
			lifecycle: levelLifecycle('template'),
		})

		expect(listGroups(updateReport)).toEqual(['removed Application'])
		const xml = (await target.document.query.getSnapshot({ as: 'xml' })) as string
		expect(xml).not.toContain('templateUuid="coupling-uuid"')
	})
})

/** An application file: `Gateway`, placed into the bay the unit placed, from its own file. */
const gatewayApplicationXml = /* xml */ `
	<SCL ${ns} ${id}="gateway-file">
		<Header id="gateway-file" uuid="gateway-file-uuid" version="0" revision="1" ${id}="gateway-header"/>
		<Substation name="TEMPLATE" ${id}="gateway-substation">
			<VoltageLevel name="TEMPLATE" ${id}="gateway-voltage-level">
				<Bay name="TEMPLATE" ${id}="gateway-bay">
					<Private type="eIEC61850-6-100" ${id}="gateway-bay-private">
						<eIEC61850-6-100:Application name="Gateway" type="DCS" uuid="gateway-uuid" ${id}="gateway-application">
							<eIEC61850-6-100:FunctionRole name="ROOT" uuid="gateway-role-uuid" ${id}="gateway-role"/>
						</eIEC61850-6-100:Application>
					</Private>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** The bay template with a standalone function no application composes. */
const bayTemplateWithMeter = bayTemplate.replace(
	`<Function name="Ctrl" uuid="ctrl-uuid" ${id}="source-ctrl"/>`,
	`<Function name="Ctrl" uuid="ctrl-uuid" ${id}="source-ctrl"/><Function name="Meter" uuid="meter-uuid" ${id}="source-meter"/>`,
)

describe('ssd update: the dropped elements and what is not the unit’s', () => {
	const bayLifecycle = (params: {
		sourceQuery: Scl.Query
		scenario: 'instantiate' | 'template'
	}): LifecycleTarget => ({
		verb: 'ssd',
		sourceQuery: params.sourceQuery,
		ref: { tagName: 'Bay', id: 'source-feeder' },
		anchor: { tagName: 'VoltageLevel', id: 'project-voltage-level' },
		scenario: params.scenario,
	})

	it('an application placed in the unit’s bay from a file of its own is kept, and not listed', async () => {
		const { project, source, target } = await createSclTestProject({
			sourceXml: bayTemplate,
			targetXml: projectXml,
		})
		if (!target) throw new Error('target required')
		const sourceQuery = source.document.query
		await reportAndApply({
			document: target.document,
			lifecycle: bayLifecycle({ sourceQuery, scenario: 'instantiate' }),
		})
		const [placedBay] = await target.document.query.getRecordsByTagName('Bay')
		const gatewayFile = await openSclDocument({
			project,
			xml: gatewayApplicationXml,
			label: 'application file',
		})
		await reportAndApply({
			document: target.document,
			lifecycle: {
				verb: 'asd',
				sourceQuery: gatewayFile.query,
				ref: { tagName: 'Application', id: 'gateway-application' },
				anchor: { tagName: 'Bay', id: placedBay.id },
				scenario: 'instantiate',
			},
		})

		const { report: updateReport } = await reportAndApply({
			document: target.document,
			lifecycle: bayLifecycle({ sourceQuery, scenario: 'template' }),
		})

		expect(listGroups(updateReport).filter((group) => group.endsWith(' Application'))).toEqual([])
		const xml = (await target.document.query.getSnapshot({ as: 'xml' })) as string
		expect(xml).toContain('templateUuid="gateway-uuid"')
	})

	it('a dropped function no dropped application composes depends on no application removal', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml: bayTemplateWithMeter,
			targetXml: projectXml,
		})
		if (!target) throw new Error('target required')
		const sourceQuery = source.document.query
		await reportAndApply({
			document: target.document,
			lifecycle: bayLifecycle({ sourceQuery, scenario: 'instantiate' }),
		})
		await source.document.transaction(async (tx) => {
			await dropDisplay(tx)
			await tx.delete({ tagName: 'Function', id: 'source-meter' } as Scl.Ref<'Function'>)
		})

		// read before any apply: the removals name elements the apply deletes
		const reported = await report(
			target.document.query,
			bayLifecycle({ sourceQuery, scenario: 'template' }),
		)

		expect(listGroups(reported)).toEqual([
			'removed Application',
			'removed Function',
			'removed Function',
		])
		const groups = allGroups(reported)
		const applicationRemoval = groups.find((group) => group.primary.tagName === 'Application')
		const dependsOnByName: Record<string, string[]> = {}
		for (const group of groups.filter((candidate) => candidate.primary.tagName === 'Function')) {
			const name = group.primary.instanceRef
				? await target.document.query.any.getAttribute(group.primary.instanceRef, { name: 'name' })
				: undefined
			dependsOnByName[name ?? ''] = group.dependsOn
		}
		expect(dependsOnByName).toEqual({ Ctrl: [applicationRemoval?.id], Meter: [] })
	})
})

/** A project bay of its own holding the unit's application and function, and another template's function. */
const projectOwnedBayXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level">
				<Bay name="Existing" uuid="existing-bay-uuid" ${id}="project-existing-bay">
					<Private type="eIEC61850-6-100" ${id}="project-existing-private">
						<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="hmi-instance-uuid" templateUuid="hmi-uuid" ${id}="project-hmi">
							<eIEC61850-6-100:FunctionRole name="ROOT" uuid="hmi-role-instance-uuid" templateUuid="hmi-role-uuid" ${id}="project-hmi-role">
								<eIEC61850-6-100:FunctionRoleContent ${id}="project-hmi-content">
									<eIEC61850-6-100:FunctionRef function="S1/V1/Existing/Prot" functionUuid="prot-instance-uuid" ${id}="project-hmi-ref"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
					</Private>
					<Function name="Prot" uuid="prot-instance-uuid" templateUuid="prot-uuid" ${id}="project-prot"/>
					<Function name="Foreign" uuid="foreign-uuid" templateUuid="foreign-template-uuid" ${id}="project-foreign"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('ssd update: a level of the project holding what the unit placed', () => {
	it("what else it holds is the project's: another template's function there is not listed, and kept", async () => {
		const { source, target } = await createSclTestProject({
			sourceXml: bayTemplate,
			targetXml: projectOwnedBayXml,
		})
		if (!target) throw new Error('target required')
		await source.document.transaction(dropDisplay)

		const { report: updateReport } = await reportAndApply({
			document: target.document,
			lifecycle: {
				verb: 'ssd',
				sourceQuery: source.document.query,
				ref: { tagName: 'Bay', id: 'source-feeder' },
				anchor: { tagName: 'VoltageLevel', id: 'project-voltage-level' },
				scenario: 'template',
			},
		})

		expect(
			listGroups(updateReport).filter((group) => / (Application|Function)$/.test(group)),
		).toEqual([])
		const xml = (await target.document.query.getSnapshot({ as: 'xml' })) as string
		expect(xml).toContain('uuid="foreign-uuid"')
	})
})
