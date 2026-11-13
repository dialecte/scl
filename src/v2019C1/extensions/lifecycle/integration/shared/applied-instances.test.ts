import { findByUuid, reportAndApply } from '../integration-helpers'

import { describe, expect, it } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { reference } from '@/v2019C1/extensions/reference'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type {
	AppliedInstance,
	AppliedInstances,
} from '@/v2019C1/extensions/lifecycle/apply/apply.types'
import type {
	LifecycleScenario,
	LifecycleTarget,
	Resolution,
} from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

// An apply says, for each instance root it returns, how it wrote it: `placed` for the first time (an instance, a
// function the template gained, a function a cascade placed), `reconciled` for an instance it matched and updated. An
// instance is applied when the write reached it: a group of it accepted, or its file reference rewritten to another
// revision. A root the write left as it was (every change of it declined, or its reference already naming the
// revision) is not returned, whatever the verb, and a function the application stands on without writing it is not
// either.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type Documents = { source: Scl.Document; target: Scl.Document }
type SetUp = (documents: Documents, testCase: TestCase) => Promise<void>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	verb: 'fsd' | 'asd' | 'ssd'
	/** The function or the application the verb is called on, by its uuid. An SSD: its substation. */
	rootUuid?: string
	/** Where the file is placed, then updated from. */
	anchor: Scl.Ref<Scl.ElementsOf>
	/** The scenario of the checked apply. */
	scenario: LifecycleScenario
	/** What is done to the documents before the checked apply: placements, edits of the project, a newer revision. */
	setUp?: SetUp
	/** The changes the consumer declines: every one, or those of the first function the report lists as an instance. */
	declined?: 'every change' | 'the first instance'
	/** What the consumer chose, given to the report and the apply. */
	resolution?: Pick<Resolution, 'sharedFunctions'>
	/**
	 * The instance roots the apply returns, applications then functions, each `<placement> <tag> [<parent>/]<name>`:
	 * the element is read by its name, and by its parent's when two share one.
	 */
	expectedInstances: string[]
	/** The source-file references of the project after the apply, `<anchor kind> <revision>`, sorted. Absent: not asserted. */
	expectedProvenance?: string[]
}

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level">
				<Bay name="B1" ${id}="project-bay"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`
const projectBay = { tagName: 'Bay', id: 'project-bay' } as Scl.Ref<'Bay'>
/** The project with a second bay B2 beside B1. */
const twoBaysProjectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level">
				<Bay name="B1" ${id}="project-bay"/>
				<Bay name="B2" ${id}="project-other-bay"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`
const projectOtherBay = { tagName: 'Bay', id: 'project-other-bay' } as Scl.Ref<'Bay'>
const projectVoltageLevel = {
	tagName: 'VoltageLevel',
	id: 'project-voltage-level',
} as Scl.Ref<'VoltageLevel'>

/** The project already holding a function carrying the uuid of the template's, without its description. */
const projectHoldingFunctionXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level">
				<Bay name="B1" ${id}="project-bay">
					<Function name="Prot" uuid="function-uuid" ${id}="project-function"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** An FSD in its first revision. */
const fsdXml = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Header id="function-file" uuid="function-file-uuid" version="1" revision="A" ${id}="source-header"/>
		<Substation name="TEMPLATE" ${id}="source-substation">
			<VoltageLevel name="TEMPLATE" ${id}="source-voltage-level">
				<Bay name="TEMPLATE" ${id}="source-bay">
					<Function name="Prot" uuid="function-uuid" ${id}="source-function"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** An ASD in its first revision: the application HMI composes the function Prot. */
const asdXml = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Header id="application-file" uuid="application-file-uuid" version="1" revision="A" ${id}="source-header"/>
		<Substation name="TEMPLATE" ${id}="source-substation">
			<Private type="eIEC61850-6-100" ${id}="source-substation-private">
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-uuid" ${id}="source-application">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="source-function-role">
						<eIEC61850-6-100:FunctionRoleContent ${id}="source-function-role-content">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-uuid" ${id}="source-function-ref"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="source-voltage-level">
				<Bay name="TEMPLATE" ${id}="source-bay">
					<Function name="Prot" uuid="function-uuid" ${id}="source-function"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** Two applications composing the same function Prot, one file: the second may stand on the function of the first. */
const twoApplicationsXml = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Header id="application-file" uuid="application-file-uuid" version="1" revision="A" ${id}="source-header"/>
		<Substation name="TEMPLATE" ${id}="source-substation">
			<Private type="eIEC61850-6-100" ${id}="source-substation-private">
				<eIEC61850-6-100:Application name="APP_A" type="PAC" uuid="application-a-uuid" ${id}="application-a">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="application-a-role">
						<eIEC61850-6-100:FunctionRoleContent ${id}="application-a-role-content">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-uuid" ${id}="application-a-function-ref"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
				<eIEC61850-6-100:Application name="APP_B" type="PAC" uuid="application-b-uuid" ${id}="application-b">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="application-b-role">
						<eIEC61850-6-100:FunctionRoleContent ${id}="application-b-role-content">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-uuid" ${id}="application-b-function-ref"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="source-voltage-level">
				<Bay name="TEMPLATE" ${id}="source-bay">
					<Function name="Prot" uuid="function-uuid" ${id}="source-function"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** An SSD bay template: the bay Feeder holds the function Prot and the application HMI composing the function Disp. */
const ssdXml = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Header id="feeder" uuid="feeder-file-uuid" version="0" revision="1" ${id}="source-header"/>
		<Substation name="TEMPLATE" ${id}="source-substation">
			<VoltageLevel name="TEMPLATE" ${id}="source-voltage-level">
				<Bay name="Feeder" uuid="feeder-uuid" ${id}="source-feeder">
					<Private type="eIEC61850-6-100" ${id}="source-feeder-private">
						<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-uuid" ${id}="source-application">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="source-function-role">
								<eIEC61850-6-100:FunctionRoleContent ${id}="source-function-role-content">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/Feeder/Disp" functionUuid="display-uuid" ${id}="source-function-ref"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
					</Private>
					<Function name="Prot" uuid="function-uuid" ${id}="source-function"/>
					<Function name="Disp" uuid="display-uuid" ${id}="source-display"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const sourceHeader = { tagName: 'Header', id: 'source-header' } as Scl.Ref<'Header'>
const sourceFunction = { tagName: 'Function', id: 'source-function' } as Scl.Ref<'Function'>
const sourceDisplay = { tagName: 'Function', id: 'source-display' } as Scl.Ref<'Function'>
const sourceApplication = {
	tagName: 'Application',
	id: 'source-application',
} as Scl.Ref<'Application'>
const sourceFunctionRoleContent = {
	tagName: 'FunctionRoleContent',
	id: 'source-function-role-content',
} as Scl.Ref<'FunctionRoleContent'>
const sourceBay = { tagName: 'Bay', id: 'source-bay' } as Scl.Ref<'Bay'>
const sourceFeeder = { tagName: 'Bay', id: 'source-feeder' } as Scl.Ref<'Bay'>
const sourceFeederPrivate = {
	tagName: 'Private',
	id: 'source-feeder-private',
} as Scl.Ref<'Private'>

/** The newer revision of the file: its Header's revision, and these elements changed (their description). */
function newerRevision(
	...changed: Scl.Ref<Scl.ElementsOf>[]
): (documents: Documents) => Promise<void> {
	return async function edit({ source }) {
		await source.transaction(async function edit(tx) {
			await tx.update(sourceHeader, { attributes: { revision: 'B' } })
			for (const ref of changed) await tx.any.update(ref, { attributes: { desc: 'rev2' } })
		})
	}
}

/** The newer revision of the ASD: the application gains the function Ctrl, and Prot changes. */
async function newerRevisionGainingControl({ source }: Documents): Promise<void> {
	await source.transaction(async function gain(tx) {
		await tx.update(sourceHeader, { attributes: { revision: 'B' } })
		await tx.update(sourceFunction, { attributes: { desc: 'rev2' } })
		await tx.addChild(sourceBay, {
			tagName: 'Function',
			attributes: { name: 'Ctrl', uuid: 'control-uuid', desc: 'rev2' },
		})
		await tx.addChild(sourceFunctionRoleContent, {
			tagName: 'FunctionRef',
			attributes: { function: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl', functionUuid: 'control-uuid' },
		})
	})
}

/** The newer revision of the bay template: the bay gains the function Meas and the application GW composing it, and Prot changes. */
async function newerRevisionGainingUnits({ source }: Documents): Promise<void> {
	await source.transaction(async function gain(tx) {
		await tx.update(sourceHeader, { attributes: { revision: 'B' } })
		await tx.any.update(sourceFunction, { attributes: { desc: 'rev2' } })
		await tx.addChild(sourceFeeder, {
			tagName: 'Function',
			attributes: { name: 'Meas', uuid: 'measure-uuid' },
		})
		const [existing] = await tx.any.findByAttributes({
			tagName: 'Application',
			attributes: { name: 'HMI' },
		})
		if (!existing) throw new Error('the bay template holds the application HMI')
		const application = await tx.any.addChild(sourceFeederPrivate, {
			tagName: 'Application',
			namespace: existing.namespace,
			attributes: { name: 'GW', type: 'DCS', uuid: 'gateway-uuid' },
		})
		const role = await tx.any.addChild(application, {
			tagName: 'FunctionRole',
			namespace: existing.namespace,
			attributes: { name: 'ROOT' },
		})
		const content = await tx.any.addChild(role, {
			tagName: 'FunctionRoleContent',
			namespace: existing.namespace,
			attributes: {},
		})
		await tx.any.addChild(content, {
			tagName: 'FunctionRef',
			namespace: existing.namespace,
			attributes: { function: 'TEMPLATE/TEMPLATE/Feeder/Meas', functionUuid: 'measure-uuid' },
		})
	})
}

/** A function of the gained lineage in the bay of the project, that no application instance refers to. */
async function holdFreeControl({ target }: Documents): Promise<void> {
	await target.transaction(async function hold(tx) {
		await tx.addChild(projectBay, {
			tagName: 'Function',
			attributes: { name: 'Ctrl', uuid: 'free-control-uuid', templateUuid: 'control-uuid' },
		})
	})
}

/** The target of the case's file, placed or updated from `sourceQuery`. */
async function lifecycleOf(params: {
	testCase: TestCase
	sourceQuery: Scl.Query
	scenario: LifecycleScenario
	anchor?: Scl.Ref<Scl.ElementsOf>
}): Promise<LifecycleTarget> {
	const { testCase, sourceQuery, scenario, anchor = testCase.anchor } = params
	const common = { sourceQuery, anchor, scenario }
	const uuid = testCase.rootUuid ?? ''
	switch (testCase.verb) {
		case 'ssd': {
			const [substation] = await sourceQuery.getRecordsByTagName('Substation')
			return { ...common, verb: 'ssd', ref: { tagName: 'Substation', id: substation.id } }
		}
		case 'fsd': {
			const ref = await findByUuid(sourceQuery, { tagName: 'Function', uuid })
			return { ...common, verb: 'fsd', ref: ref as Scl.Ref<'Function'> }
		}
		case 'asd': {
			const ref = await findByUuid(sourceQuery, { tagName: 'Application', uuid })
			return { ...common, verb: 'asd', ref: ref as Scl.Ref<'Application'> }
		}
	}
}

/** The file placed, as a first instantiate does. */
function placedUnder(...anchors: Scl.Ref<Scl.ElementsOf>[]): SetUp {
	return async function place({ source, target }, testCase) {
		for (const anchor of anchors) {
			const lifecycle = await lifecycleOf({
				testCase,
				sourceQuery: source.query,
				scenario: 'instantiate',
				anchor,
			})
			await reportAndApply({ document: target, lifecycle })
		}
	}
}

/** Several set-ups, one after the other. */
function inOrder(...steps: SetUp[]): SetUp {
	return async function run(documents, testCase) {
		for (const step of steps) await step(documents, testCase)
	}
}

/** Every group of a report declined. */
function declineAll(reported: DiffReport): DecisionMap {
	return new Map(allGroups(reported).map((group) => [group.id, 'skip' as const]))
}

/** The groups of the first function the report lists as an instance declined, the others at their suggested action. */
function declineFirstInstance(reported: DiffReport): DecisionMap {
	const [first] = reported.instances.filter((instance) => instance.rootRef?.tagName === 'Function')
	return new Map((first?.groups ?? []).map((group) => [group.id, 'skip' as const]))
}

const DECLINE: Record<NonNullable<TestCase['declined']>, (reported: DiffReport) => DecisionMap> = {
	'every change': declineAll,
	'the first instance': declineFirstInstance,
}

/** The instance roots a descriptor names, as the apply returns them: the element read in the project. */
async function resolveInstance(
	query: Scl.Query,
	descriptor: string,
): Promise<AppliedInstance<Scl.ElementsOf>> {
	const [placement, tagName, path = ''] = descriptor.split(' ')
	const names = path.split('/')
	const name = names.at(-1) ?? ''
	const parentName = names.at(-2)
	const candidates = await query.any.findByAttributes({
		tagName: tagName as Scl.ElementsOf,
		attributes: { name },
	})
	for (const candidate of candidates) {
		const parent = candidate.parent
		const named = parent ? (await query.any.getAttributes(parent)).name : undefined
		if (parentName === undefined || named === parentName) {
			return {
				ref: { tagName: tagName as Scl.ElementsOf, id: candidate.id } as Scl.Ref<Scl.ElementsOf>,
				placement: placement as AppliedInstance<Scl.ElementsOf>['placement'],
			}
		}
	}
	throw new Error(['no', tagName, path, 'in the project'].join(' '))
}

/** The source-file references a project holds, `<anchor kind> <revision>`, sorted. */
async function provenanceOf(query: Scl.Query): Promise<string[]> {
	const entries = await reference.query.getProvenance(query)
	return entries.map((entry) => `${entry.anchor.kind} ${entry.revision}`).sort()
}

/** The roots an apply returned: the applications, then the functions (an IED's, the IEDs). */
function rootsOf(instances: AppliedInstances): AppliedInstance<Scl.ElementsOf>[] {
	switch (instances.verb) {
		case 'fsd':
			return instances.functions
		case 'ied':
			return instances.ieds
		default:
			return [...instances.applications, ...instances.functions]
	}
}

describe('apply — each instance root says how it was written', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'instantiate a function → the function is placed': {
			sourceXml: fsdXml,
			targetXml: projectXml,
			verb: 'fsd',
			rootUuid: 'function-uuid',
			anchor: projectBay,
			scenario: 'instantiate',
			expectedInstances: ['placed Function B1/Prot'],
		},
		'instantiate an application → the application and the function it composes are placed': {
			sourceXml: asdXml,
			targetXml: projectXml,
			verb: 'asd',
			rootUuid: 'application-uuid',
			anchor: projectBay,
			scenario: 'instantiate',
			expectedInstances: ['placed Application HMI', 'placed Function B1/Prot'],
		},
		'instantiate a bay template → its application and its functions are placed': {
			sourceXml: ssdXml,
			targetXml: projectXml,
			verb: 'ssd',
			anchor: projectVoltageLevel,
			scenario: 'instantiate',
			expectedInstances: [
				'placed Application HMI',
				'placed Function Feeder/Prot',
				'placed Function Feeder/Disp',
			],
		},
		'update of a placed function, its change accepted → the function is reconciled': {
			sourceXml: fsdXml,
			targetXml: projectXml,
			verb: 'fsd',
			rootUuid: 'function-uuid',
			anchor: projectBay,
			scenario: 'template',
			setUp: inOrder(placedUnder(projectBay), newerRevision(sourceFunction)),
			expectedInstances: ['reconciled Function B1/Prot'],
		},
		'update with no instance yet → the function is placed': {
			sourceXml: fsdXml,
			targetXml: projectXml,
			verb: 'fsd',
			rootUuid: 'function-uuid',
			anchor: projectBay,
			scenario: 'template',
			expectedInstances: ['placed Function B1/Prot'],
		},
		'fork of a function the project holds by its own uuid → the function is reconciled': {
			sourceXml: fsdXml,
			targetXml: projectHoldingFunctionXml,
			verb: 'fsd',
			rootUuid: 'function-uuid',
			anchor: projectBay,
			scenario: 'fork',
			setUp: newerRevision(sourceFunction),
			expectedInstances: ['reconciled Function B1/Prot'],
		},
		'update of a placed function the newer revision changes nothing in but its revision → the function is reconciled, its file reference names the newer revision':
			{
				sourceXml: fsdXml,
				targetXml: projectXml,
				verb: 'fsd',
				rootUuid: 'function-uuid',
				anchor: projectBay,
				scenario: 'template',
				setUp: inOrder(placedUnder(projectBay), newerRevision()),
				expectedInstances: ['reconciled Function B1/Prot'],
				expectedProvenance: ['function B'],
			},
		'update of a placed function from the revision it already names → no root is returned, the reference is as it was':
			{
				sourceXml: fsdXml,
				targetXml: projectXml,
				verb: 'fsd',
				rootUuid: 'function-uuid',
				anchor: projectBay,
				scenario: 'template',
				setUp: placedUnder(projectBay),
				expectedInstances: [],
				expectedProvenance: ['function A'],
			},
		'update of a placed function, every change declined → no root is returned': {
			sourceXml: fsdXml,
			targetXml: projectXml,
			verb: 'fsd',
			rootUuid: 'function-uuid',
			anchor: projectBay,
			scenario: 'template',
			setUp: inOrder(placedUnder(projectBay), newerRevision(sourceFunction)),
			declined: 'every change',
			expectedInstances: [],
		},
		'update of a function placed twice, the changes of the first declined → only the other is returned':
			{
				sourceXml: fsdXml,
				targetXml: twoBaysProjectXml,
				verb: 'fsd',
				rootUuid: 'function-uuid',
				anchor: projectVoltageLevel,
				scenario: 'template',
				setUp: inOrder(placedUnder(projectBay, projectOtherBay), newerRevision(sourceFunction)),
				declined: 'the first instance',
				expectedInstances: ['reconciled Function B2/Prot'],
			},
		'update of a placed application gaining a function → the application and the function it kept are reconciled, the gained one placed':
			{
				sourceXml: asdXml,
				targetXml: projectXml,
				verb: 'asd',
				rootUuid: 'application-uuid',
				anchor: projectBay,
				scenario: 'template',
				setUp: inOrder(placedUnder(projectBay), newerRevisionGainingControl),
				expectedInstances: [
					'reconciled Application HMI',
					'reconciled Function B1/Prot',
					'placed Function B1/Ctrl',
				],
			},
		'update of a placed application gaining a function the bay holds free → the function it takes is reconciled':
			{
				sourceXml: asdXml,
				targetXml: projectXml,
				verb: 'asd',
				rootUuid: 'application-uuid',
				anchor: projectBay,
				scenario: 'template',
				setUp: inOrder(placedUnder(projectBay), holdFreeControl, newerRevisionGainingControl),
				expectedInstances: [
					'reconciled Application HMI',
					'reconciled Function B1/Prot',
					'reconciled Function B1/Ctrl',
				],
			},
		'update of a placed application, every change declined → no root is returned': {
			sourceXml: asdXml,
			targetXml: projectXml,
			verb: 'asd',
			rootUuid: 'application-uuid',
			anchor: projectBay,
			scenario: 'template',
			setUp: inOrder(placedUnder(projectBay), newerRevision(sourceApplication, sourceFunction)),
			declined: 'every change',
			expectedInstances: [],
		},
		'update of a placed application the newer revision changes nothing in but its revision → the application is reconciled, its file reference names the newer revision':
			{
				sourceXml: asdXml,
				targetXml: projectXml,
				verb: 'asd',
				rootUuid: 'application-uuid',
				anchor: projectBay,
				scenario: 'template',
				setUp: inOrder(placedUnder(projectBay), newerRevision()),
				expectedInstances: ['reconciled Application HMI'],
				expectedProvenance: ['application B'],
			},
		'update of a placed application from the revision it already names → no root is returned, the reference is as it was':
			{
				sourceXml: asdXml,
				targetXml: projectXml,
				verb: 'asd',
				rootUuid: 'application-uuid',
				anchor: projectBay,
				scenario: 'template',
				setUp: placedUnder(projectBay),
				expectedInstances: [],
				expectedProvenance: ['application A'],
			},
		'update of a placed bay template, its changes accepted → the application and the functions are reconciled':
			{
				sourceXml: ssdXml,
				targetXml: projectXml,
				verb: 'ssd',
				anchor: projectVoltageLevel,
				scenario: 'template',
				setUp: inOrder(
					placedUnder(projectVoltageLevel),
					newerRevision(sourceApplication, sourceFunction, sourceDisplay),
				),
				expectedInstances: [
					'reconciled Application HMI',
					'reconciled Function Feeder/Prot',
					'reconciled Function Feeder/Disp',
				],
			},
		'update of a placed bay template gaining an application and a function → they are placed beside the ones it kept, which are reconciled':
			{
				sourceXml: ssdXml,
				targetXml: projectXml,
				verb: 'ssd',
				anchor: projectVoltageLevel,
				scenario: 'template',
				setUp: inOrder(placedUnder(projectVoltageLevel), newerRevisionGainingUnits),
				expectedInstances: [
					'placed Application GW',
					'reconciled Function Feeder/Prot',
					'placed Function Feeder/Meas',
				],
			},
		'first placement of an application standing on a function another one placed (merged) → only the application is placed':
			{
				sourceXml: twoApplicationsXml,
				targetXml: projectXml,
				verb: 'asd',
				rootUuid: 'application-b-uuid',
				anchor: projectBay,
				scenario: 'instantiate',
				resolution: { sharedFunctions: 'merge' },
				setUp: async function placeTheFirstApplication({ source, target }, testCase) {
					const first = await findByUuid(source.query, {
						tagName: 'Application',
						uuid: 'application-a-uuid',
					})
					await reportAndApply({
						document: target,
						lifecycle: {
							verb: 'asd',
							sourceQuery: source.query,
							ref: first,
							anchor: testCase.anchor,
							scenario: 'instantiate',
						},
					})
				},
				expectedInstances: ['placed Application APP_B'],
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>) {
		if (!target) throw new Error('target required')
		await testCase.setUp?.({ source, target }, testCase)

		const lifecycle = await lifecycleOf({
			testCase,
			sourceQuery: source.query,
			scenario: testCase.scenario,
		})
		// reported then applied as a consumer does, both given the choices it made
		const reported = await report(target.query, {
			...lifecycle,
			...(testCase.resolution ? { resolution: testCase.resolution } : {}),
		})
		const decisions = testCase.declined ? DECLINE[testCase.declined](reported) : new Map()
		const applied = await target.transaction(async function applyReport(tx) {
			return apply(tx, {
				...lifecycle,
				report: reported,
				resolution: { ...testCase.resolution, decisions },
			})
		})

		const expected = await Promise.all(
			testCase.expectedInstances.map((descriptor) => resolveInstance(target.query, descriptor)),
		)
		const returned = rootsOf(applied.instances)
		expect(returned, 'instance roots').toHaveLength(expected.length)
		expect(returned, 'instance roots').toEqual(expect.arrayContaining(expected))
		if (testCase.expectedProvenance) {
			const provenance = await provenanceOf(target.query)
			expect(provenance, 'file references').toEqual(testCase.expectedProvenance)
		}
		return { assertOn: 'target' as const }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('apply — the roots reach the consumer as they are returned', () => {
	async function projectDocuments() {
		return createSclTestProject({ sourceXml: fsdXml, targetXml: projectXml })
	}

	it('not decided yet (nothing is written) → no root is returned', async () => {
		const { source, target } = await projectDocuments()
		if (!target) throw new Error('target required')
		const lifecycle = await lifecycleOfFunction(source.document.query)
		const reported = await report(target.document.query, lifecycle)

		let result: Awaited<ReturnType<typeof apply>> | undefined
		await target.document.transaction(async (tx) => {
			result = await apply(tx, { ...lifecycle, report: { ...reported, needsDecisions: true } })
		})

		expect(result?.instances).toEqual({ verb: 'fsd', functions: [] })
	})

	it("the consumer's step receives what the apply returns, each root saying how it was written", async () => {
		const { source, target } = await projectDocuments()
		if (!target) throw new Error('target required')
		const lifecycle = await lifecycleOfFunction(source.document.query)
		const reported = await report(target.document.query, lifecycle)

		const received: AppliedInstances[] = []
		let result: Awaited<ReturnType<typeof apply>> | undefined
		await target.document.transaction(async (tx) => {
			result = await apply(tx, {
				...lifecycle,
				report: reported,
				resolution: {
					afterApply: async function keepWhatIsReceived(_tx, { instances }) {
						received.push(instances)
					},
				},
			})
		})

		expect(received).toHaveLength(1)
		expect(received[0]).toBe(result?.instances)
		expect(
			received[0]?.verb === 'fsd' && received[0].functions.map((entry) => entry.placement),
		).toEqual(['placed'])
	})
})

/** The function of the FSD file, to be placed in the bay of the project. */
async function lifecycleOfFunction(sourceQuery: Scl.Query) {
	const ref = await findByUuid(sourceQuery, { tagName: 'Function', uuid: 'function-uuid' })
	return { verb: 'fsd' as const, sourceQuery, ref, anchor: projectBay }
}

describe('apply — a function the application takes where it stands is returned when its own change is written', () => {
	async function updatedWithoutTheReference() {
		const { source, target } = await createSclTestProject({
			sourceXml: asdXml,
			targetXml: projectXml,
		})
		if (!target) throw new Error('target required')
		const ref = await findByUuid(source.document.query, {
			tagName: 'Application',
			uuid: 'application-uuid',
		})
		const lifecycle = {
			verb: 'asd' as const,
			sourceQuery: source.document.query,
			ref,
			anchor: projectBay,
		}
		await reportAndApply({
			document: target.document,
			lifecycle: { ...lifecycle, scenario: 'instantiate' },
		})
		await holdFreeControl({ source: source.document, target: target.document })
		await source.document.transaction(async function gain(tx) {
			await tx.update(sourceHeader, { attributes: { revision: 'B' } })
			await tx.addChild(sourceBay, {
				tagName: 'Function',
				attributes: { name: 'Ctrl', uuid: 'control-uuid', desc: 'rev2' },
			})
			await tx.addChild(sourceFunctionRoleContent, {
				tagName: 'FunctionRef',
				attributes: { function: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl', functionUuid: 'control-uuid' },
			})
		})
		const { applied } = await reportAndApply({
			document: target.document,
			lifecycle: { ...lifecycle, scenario: 'template' },
			decide: declineNewReference,
		})
		return { applied, query: target.document.query }
	}

	it('the reference to it declined, only its file reference written on the application → the application and the function are reconciled', async () => {
		const { applied, query } = await updatedWithoutTheReference()

		const application = await resolveInstance(query, 'reconciled Application HMI')
		const control = await resolveInstance(query, 'reconciled Function B1/Ctrl')
		const provenance = await provenanceOf(query)
		expect(provenance, 'file references').toContain('application B')
		expect(rootsOf(applied.instances)).toEqual([application, control])
	})
})

/** The group adding a reference declined, every other group accepted. */
function declineNewReference(reported: DiffReport): DecisionMap {
	return new Map(
		allGroups(reported).map((group) => [
			group.id,
			group.change === 'added' && group.primary.tagName === 'FunctionRef'
				? ('skip' as const)
				: ('accept' as const),
		]),
	)
}
