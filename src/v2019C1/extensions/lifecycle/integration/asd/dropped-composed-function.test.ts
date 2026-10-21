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
	/** The scenario the application is placed with, then updated with. */
	placedWith: LifecycleScenario
	updatedWith: LifecycleScenario
	/** The update is given the first revision as its base. */
	withBase?: boolean
	/** What the project adds before the update. */
	editProject?: (tx: Scl.Transaction) => Promise<void>
	/** The groups of the update's report, `<change> <tag>`, sorted. */
	expectedGroups: string[]
	/** The removal of the function depends on the removal of the reference to it. */
	expectedDependency?: boolean
}

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level">
				<Bay name="B1" ${id}="project-bay"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** An application composing `Prot` and `Ctrl`. */
const applicationXml = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Header id="application-file" uuid="application-file-uuid" version="0" revision="1" ${id}="source-header"/>
		<Substation name="TEMPLATE" ${id}="source-substation">
			<VoltageLevel name="TEMPLATE" ${id}="source-voltage-level">
				<Bay name="TEMPLATE" ${id}="source-bay">
					<Private type="eIEC61850-6-100" ${id}="source-bay-private">
						<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-uuid" ${id}="source-application">
							<eIEC61850-6-100:FunctionRole name="ROOT" uuid="role-uuid" ${id}="source-role">
								<eIEC61850-6-100:FunctionRoleContent ${id}="source-role-content">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="prot-uuid" ${id}="source-prot-ref"/>
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl" functionUuid="ctrl-uuid" ${id}="source-ctrl-ref"/>
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

/** The next revision no longer composes `Ctrl`. */
async function dropCtrl(tx: Scl.Transaction): Promise<void> {
	await tx.delete({ tagName: 'FunctionRef', id: 'source-ctrl-ref' } as Scl.Ref<'FunctionRef'>)
	await tx.delete({ tagName: 'Function', id: 'source-ctrl' } as Scl.Ref<'Function'>)
}

/** Another application of the project composes `Ctrl` too. */
async function composeCtrlElsewhere(tx: Scl.Transaction): Promise<void> {
	const [ctrl] = await tx.any.findByAttributes({
		tagName: 'Function',
		attributes: { name: 'Ctrl' },
	})
	const [hmi] = await tx.any.findByAttributes({
		tagName: 'Application',
		attributes: { name: 'HMI' },
	})
	if (!ctrl || !hmi?.parent) throw new Error('the bay holds Ctrl and HMI')
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

describe('asd update: a function the newer template no longer composes', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'its reference and the function itself are listed removed, the function after the reference, and removed':
			{
				sourceXml: applicationXml,
				targetXml: projectXml,
				placedWith: 'instantiate',
				updatedWith: 'template',
				expectedGroups: ['removed Function', 'removed FunctionRef'],
				expectedDependency: true,
				expectedQueries: ['//default:Function[@templateUuid="prot-uuid"]'],
				unexpectedQueries: [
					'//default:Function[@templateUuid="ctrl-uuid"]',
					'//v2019C1:FunctionRef[contains(@function, "Ctrl")]',
				],
			},
		'a function another application of the project composes is kept, and not listed': {
			sourceXml: applicationXml,
			targetXml: projectXml,
			placedWith: 'instantiate',
			updatedWith: 'template',
			editProject: composeCtrlElsewhere,
			expectedGroups: ['removed FunctionRef'],
			expectedQueries: [
				'//default:Function[@templateUuid="ctrl-uuid"]',
				'//v2019C1:Application[@name="Operator"]//v2019C1:FunctionRef',
			],
		},
		'a fork given the previous revision removes the function that revision composed': {
			sourceXml: applicationXml,
			targetXml: projectXml,
			placedWith: 'fork',
			updatedWith: 'fork',
			withBase: true,
			expectedGroups: ['removed Function', 'removed FunctionRef'],
			expectedDependency: true,
			unexpectedQueries: ['//default:Function[@uuid="ctrl-uuid"]'],
		},
		"a fork without it lists the function as the project's own and keeps it": {
			sourceXml: applicationXml,
			targetXml: projectXml,
			placedWith: 'fork',
			updatedWith: 'fork',
			expectedGroups: ['removed FunctionRef', 'target-only Function'],
			expectedQueries: ['//default:Function[@uuid="ctrl-uuid"]'],
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
			? await openSclDocument({ project, xml: applicationXml, label: 'previous revision' })
			: undefined
		const lifecycle = (scenario: LifecycleScenario, baseQuery?: Scl.Query): LifecycleTarget =>
			({
				verb: 'asd',
				sourceQuery: source.query,
				ref: { tagName: 'Application', id: 'source-application' },
				anchor: { tagName: 'Bay', id: 'project-bay' },
				scenario,
				...(baseQuery ? { baseQuery } : {}),
			}) as LifecycleTarget

		await reportAndApply({ document: target, lifecycle: lifecycle(testCase.placedWith) })
		if (testCase.editProject) await target.transaction(testCase.editProject)
		await source.transaction(dropCtrl)
		const { report } = await reportAndApply({
			document: target,
			lifecycle: lifecycle(testCase.updatedWith, base?.query),
		})

		expect(listGroups(report)).toEqual(testCase.expectedGroups)
		if (testCase.expectedDependency) {
			const groups = allGroups(report)
			const functionRemoval = groups.find((group) => group.primary.tagName === 'Function')
			const referenceRemoval = groups.find((group) => group.primary.tagName === 'FunctionRef')
			expect(functionRemoval?.dependsOn).toEqual([referenceRemoval?.id])
		}
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** A project holding two instances of the application, sharing one `Ctrl`: the newer application composes `Prot` only. */
const sharedProjectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level">
				<Bay name="B1" ${id}="project-bay">
					<Private type="eIEC61850-6-100" ${id}="project-bay-private">
						<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="first-instance-uuid" templateUuid="application-uuid" ${id}="first-instance">
							<eIEC61850-6-100:FunctionRole name="ROOT" uuid="first-role-uuid" templateUuid="role-uuid" ${id}="first-role">
								<eIEC61850-6-100:FunctionRoleContent ${id}="first-role-content">
									<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Prot" functionUuid="first-prot-uuid" ${id}="first-prot-ref"/>
									<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Ctrl" functionUuid="shared-ctrl-uuid" ${id}="first-ctrl-ref"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
						<eIEC61850-6-100:Application name="HMI_1" type="DCS" uuid="second-instance-uuid" templateUuid="application-uuid" ${id}="second-instance">
							<eIEC61850-6-100:FunctionRole name="ROOT" uuid="second-role-uuid" templateUuid="role-uuid" ${id}="second-role">
								<eIEC61850-6-100:FunctionRoleContent ${id}="second-role-content">
									<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Prot_1" functionUuid="second-prot-uuid" ${id}="second-prot-ref"/>
									<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Ctrl" functionUuid="shared-ctrl-uuid" ${id}="second-ctrl-ref"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
					</Private>
					<Function name="Prot" uuid="first-prot-uuid" templateUuid="prot-uuid" ${id}="first-prot"/>
					<Function name="Prot_1" uuid="second-prot-uuid" templateUuid="prot-uuid" ${id}="second-prot"/>
					<Function name="Ctrl" uuid="shared-ctrl-uuid" templateUuid="ctrl-uuid" ${id}="shared-ctrl"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('asd update: a dropped function the instances of the application share', () => {
	it('is listed once, after both references to it, and removed', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml: applicationXml,
			targetXml: sharedProjectXml,
		})
		if (!target) throw new Error('target required')
		await source.document.transaction(dropCtrl)

		const { report } = await reportAndApply({
			document: target.document,
			lifecycle: {
				verb: 'asd',
				sourceQuery: source.document.query,
				ref: { tagName: 'Application', id: 'source-application' },
				anchor: { tagName: 'Bay', id: 'project-bay' },
				scenario: 'template',
			},
		})

		expect(listGroups(report)).toEqual([
			'removed Function',
			'removed FunctionRef',
			'removed FunctionRef',
		])
		const groups = allGroups(report)
		const functionRemoval = groups.find((group) => group.primary.tagName === 'Function')
		const referenceRemovals = groups.filter((group) => group.primary.tagName === 'FunctionRef')
		expect(functionRemoval?.dependsOn.sort()).toEqual(
			referenceRemovals.map((group) => group.id).sort(),
		)
		const xml = (await target.document.query.getSnapshot({ as: 'xml' })) as string
		expect(xml).not.toContain('shared-ctrl-uuid')
	})
})

/** A function file: `Meter`, placed into the project's bay from its own file. */
const meterFunctionXml = /* xml */ `
	<SCL ${ns} ${id}="meter-file">
		<Header id="meter-file" uuid="meter-file-uuid" version="0" revision="1" ${id}="meter-header"/>
		<Substation name="TEMPLATE" ${id}="meter-substation">
			<VoltageLevel name="TEMPLATE" ${id}="meter-voltage-level">
				<Bay name="TEMPLATE" ${id}="meter-bay">
					<Function name="Meter" uuid="meter-uuid" ${id}="meter-function"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const projectWithHeaderXml = projectXml.replace(
	`<Substation name="S1"`,
	`<Header id="project" uuid="project-file-uuid" ${id}="project-header"/><Substation name="S1"`,
)

/** The application of the file, placed into the project's bay or updated there. */
function placeApplication(params: {
	sourceQuery: Scl.Query
	scenario: 'instantiate' | 'template'
}): LifecycleTarget {
	return {
		verb: 'asd',
		sourceQuery: params.sourceQuery,
		ref: { tagName: 'Application', id: 'source-application' },
		anchor: { tagName: 'Bay', id: 'project-bay' },
		scenario: params.scenario,
	}
}

/** The placed application's instance also refers to a function of the project, by its uuid. */
async function referToFunction(params: {
	tx: Scl.Transaction
	functionUuid: string
}): Promise<void> {
	const { tx, functionUuid } = params
	const [content] = await tx.any.findByAttributes({
		tagName: 'FunctionRoleContent',
		attributes: {},
	})
	if (!content) throw new Error('the placed application has a function role')
	await tx.any.addChild(content, {
		tagName: 'FunctionRef',
		namespace: content.namespace,
		attributes: { functionUuid },
	})
}

describe('asd update: a function the instance refers to that the template never composed', () => {
	it('a function placed from a file of its own is not the template’s to drop: kept, not listed', async () => {
		const { project, source, target } = await createSclTestProject({
			sourceXml: applicationXml,
			targetXml: projectWithHeaderXml,
		})
		if (!target) throw new Error('target required')
		await reportAndApply({
			document: target.document,
			lifecycle: placeApplication({ sourceQuery: source.document.query, scenario: 'instantiate' }),
		})
		const meterFile = await openSclDocument({
			project,
			xml: meterFunctionXml,
			label: 'function file',
		})
		await reportAndApply({
			document: target.document,
			lifecycle: {
				verb: 'fsd',
				sourceQuery: meterFile.query,
				ref: { tagName: 'Function', id: 'meter-function' },
				anchor: { tagName: 'Bay', id: 'project-bay' },
				scenario: 'instantiate',
			},
		})
		const [meter] = await target.document.query.any.findByAttributes({
			tagName: 'Function',
			attributes: { templateUuid: 'meter-uuid' },
		})
		const meterUuid = meter
			? await target.document.query.any.getAttribute(meter, { name: 'uuid' })
			: ''
		await target.document.transaction((tx) =>
			referToFunction({ tx, functionUuid: meterUuid ?? '' }),
		)
		await source.document.transaction(dropCtrl)
		const [ctrl] = await target.document.query.any.findByAttributes({
			tagName: 'Function',
			attributes: { templateUuid: 'ctrl-uuid' },
		})

		const { report } = await reportAndApply({
			document: target.document,
			lifecycle: placeApplication({ sourceQuery: source.document.query, scenario: 'template' }),
		})

		// the only function listed removed is the one the template dropped
		const removedFunctions = allGroups(report).filter(
			(group) => group.primary.tagName === 'Function' && group.primary.change === 'removed',
		)
		expect(removedFunctions.map((group) => group.primary.instanceRef?.id)).toEqual([ctrl?.id])
		const xml = (await target.document.query.getSnapshot({ as: 'xml' })) as string
		expect(xml).toContain('templateUuid="meter-uuid"')
	})

	it('a function of the project’s own, without lineage, is kept and not listed', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml: applicationXml,
			targetXml: projectXml.replace(
				`<Bay name="B1" ${id}="project-bay"/>`,
				`<Bay name="B1" ${id}="project-bay"><Function name="Own" uuid="own-function-uuid" ${id}="project-own-function"/></Bay>`,
			),
		})
		if (!target) throw new Error('target required')
		await reportAndApply({
			document: target.document,
			lifecycle: placeApplication({ sourceQuery: source.document.query, scenario: 'instantiate' }),
		})
		await target.document.transaction((tx) =>
			referToFunction({ tx, functionUuid: 'own-function-uuid' }),
		)
		await source.document.transaction(dropCtrl)
		const [ctrl] = await target.document.query.any.findByAttributes({
			tagName: 'Function',
			attributes: { templateUuid: 'ctrl-uuid' },
		})

		const { report } = await reportAndApply({
			document: target.document,
			lifecycle: placeApplication({ sourceQuery: source.document.query, scenario: 'template' }),
		})

		// the only function listed removed is the one the template dropped
		const removedFunctions = allGroups(report).filter(
			(group) => group.primary.tagName === 'Function' && group.primary.change === 'removed',
		)
		expect(removedFunctions.map((group) => group.primary.instanceRef?.id)).toEqual([ctrl?.id])
		const xml = (await target.document.query.getSnapshot({ as: 'xml' })) as string
		expect(xml).toContain('uuid="own-function-uuid"')
	})
})

/** The next revision composes neither function. */
async function dropBoth(tx: Scl.Transaction): Promise<void> {
	await dropCtrl(tx)
	await tx.delete({ tagName: 'FunctionRef', id: 'source-prot-ref' } as Scl.Ref<'FunctionRef'>)
	await tx.delete({ tagName: 'Function', id: 'source-prot' } as Scl.Ref<'Function'>)
}

describe('asd update: several functions the newer template no longer composes', () => {
	it('each removal of a function depends on the removal of its own reference only', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml: applicationXml,
			targetXml: projectXml,
		})
		if (!target) throw new Error('target required')
		await reportAndApply({
			document: target.document,
			lifecycle: placeApplication({ sourceQuery: source.document.query, scenario: 'instantiate' }),
		})
		await source.document.transaction(dropBoth)

		// read before any apply: the removals name elements the apply deletes
		const reported = await report(
			target.document.query,
			placeApplication({ sourceQuery: source.document.query, scenario: 'template' }),
		)

		expect(listGroups(reported)).toEqual([
			'removed Function',
			'removed Function',
			'removed FunctionRef',
			'removed FunctionRef',
		])
		const groups = allGroups(reported)
		const query = target.document.query
		for (const functionRemoval of groups.filter((group) => group.primary.tagName === 'Function')) {
			const functionUuid = functionRemoval.primary.instanceRef
				? await query.any.getAttribute(functionRemoval.primary.instanceRef, { name: 'uuid' })
				: undefined
			const ownReference: string[] = []
			for (const group of groups) {
				if (group.primary.tagName !== 'FunctionRef' || !group.primary.instanceRef) continue
				const named = await query.any.getAttribute(group.primary.instanceRef, {
					name: 'functionUuid',
				})
				if (named === functionUuid) ownReference.push(group.id)
			}
			expect(ownReference).toHaveLength(1)
			expect(functionRemoval.dependsOn).toEqual(ownReference)
		}
	})
})
