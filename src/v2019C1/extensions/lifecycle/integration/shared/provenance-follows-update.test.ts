import { findByName, findByUuid, reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { report as reportUpdate } from '@/v2019C1/extensions/lifecycle/report'
import { fsd as updateFsd } from '@/v2019C1/extensions/lifecycle/update/transaction'
import { reference } from '@/v2019C1/extensions/reference'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'
import { readRevisionTwin } from '@/v2019C1/test/revision-twins'

import type { Scl } from '@/v2019C1/config'
import type {
	LifecycleScenario,
	LifecycleTarget,
} from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	verb: 'fsd' | 'asd' | 'ssd'
	/** The function or the application of the file, by its uuid. */
	rootUuid?: string
	/** The level of an SSD the case names, by its name. Default: its substation. */
	unit?: { tagName: 'VoltageLevel' | 'Bay'; name: string }
	/** Where the file is placed, then updated from. */
	anchor: Scl.Ref<Scl.ElementsOf>
	/** The scenario of the placement and of the updates. Default: instantiated, then updated as a template. */
	scenario?: Extract<LifecycleScenario, 'fork'>
	/** The newer revision: another file, or the source edited. */
	next: { sourceXml?: string; editSource?: (tx: Scl.Transaction) => Promise<void> }
	/** The changes of the update declined: every one, those of the application only, or those of one function. */
	declined?:
		| 'every change'
		| 'the application changes'
		| 'the first function changes'
		| 'the new reference, not the placement'
		| 'the first instance, and the new reference of the other'
	/** Placed under each of these (one instance each) instead of `anchor`; updated from `anchor`. */
	placedUnder?: Scl.Ref<Scl.ElementsOf>[]
	/** What the project changes in the instance once placed. */
	editProject?: (tx: Scl.Transaction) => Promise<void>
	/** The function updated by the update verb itself, with the report and no decisions. */
	updatedDirectly?: boolean
	/** Updated a second time from the same revision. */
	updatedTwice?: boolean
	/** The source-file references of the project after the updates, `<anchor kind> <file> <version>/<revision>`, sorted. */
	expectedProvenance: string[]
	/** The tolerated violations, when the placement leaves some. */
	allowInvalidOutput?: SclTest.BaseXmlTestCase['allowInvalidOutput']
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
const twoBaysProjectXml = projectXml.replace(
	'</VoltageLevel>',
	`<Bay name="B2" ${id}="project-other-bay"/></VoltageLevel>`,
)
const projectOtherBay = { tagName: 'Bay', id: 'project-other-bay' } as Scl.Ref<'Bay'>
const projectVoltageLevel = {
	tagName: 'VoltageLevel',
	id: 'project-voltage-level',
} as Scl.Ref<'VoltageLevel'>

/** An FSD in its first revision (version 1, revision A). */
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

/** An ASD in its first revision (version 1, revision A); its function records the FSD it was placed from. */
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
					<Function name="Prot" uuid="function-uuid" templateUuid="library-function" ${id}="source-function">
						<Private type="eIEC61850-6-100" ${id}="source-function-private">
							<eIEC61850-6-100:FunctionSclRef ${id}="source-function-sclref">
								<eIEC61850-6-100:SclFileReference fileName="prot-library" fileType="FSD" fileUuid="prot-library-uuid" version="3" revision="1" ${id}="source-function-file"/>
							</eIEC61850-6-100:FunctionSclRef>
						</Private>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** An SSD bay template in its first revision (version 0, revision 1). */
const ssdXml = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Header id="feeder" uuid="feeder-file-uuid" version="0" revision="1" ${id}="source-header"/>
		<Substation name="TEMPLATE" ${id}="source-substation">
			<VoltageLevel name="TEMPLATE" ${id}="source-voltage-level">
				<Bay name="Feeder" uuid="feeder-uuid" ${id}="source-feeder">
					<Function name="Prot" uuid="function-uuid" ${id}="source-function"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** The newer revision of the inline file: its Header's version and revision, and a changed description. */
function nextRevision(params: {
	version: string
	revision: string
	changed: Scl.Ref<Scl.ElementsOf>
}): (tx: Scl.Transaction) => Promise<void> {
	const { version, revision, changed } = params
	return async function edit(tx) {
		await tx.update({ tagName: 'Header', id: 'source-header' } as Scl.Ref<'Header'>, {
			attributes: { version, revision },
		})
		await tx.any.update(changed, { attributes: { desc: 'rev2' } })
	}
}
const sourceFunction = { tagName: 'Function', id: 'source-function' } as Scl.Ref<'Function'>
const sourceApplication = {
	tagName: 'Application',
	id: 'source-application',
} as Scl.Ref<'Application'>

/** The newer ASD revision: its Header version 2 revision B, the application gaining the function `Ctrl`. */
async function nextGainingControl(tx: Scl.Transaction): Promise<void> {
	await tx.update({ tagName: 'Header', id: 'source-header' } as Scl.Ref<'Header'>, {
		attributes: { version: '2', revision: 'B' },
	})
	await tx.addChild({ tagName: 'Bay', id: 'source-bay' } as Scl.Ref<'Bay'>, {
		tagName: 'Function',
		attributes: { name: 'Ctrl', uuid: 'control-uuid' },
	})
	await tx.addChild(
		{
			tagName: 'FunctionRoleContent',
			id: 'source-function-role-content',
		} as Scl.Ref<'FunctionRoleContent'>,
		{
			tagName: 'FunctionRef',
			attributes: { function: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl', functionUuid: 'control-uuid' },
		},
	)
}

/** The newer ASD revision: its Header version 2 revision B, the application and its function changed. */
async function nextApplicationAndFunction(tx: Scl.Transaction): Promise<void> {
	await nextRevision({ version: '2', revision: 'B', changed: sourceApplication })(tx)
	await tx.update(sourceFunction, { attributes: { desc: 'rev2' } })
}

/** One level of the bay template twin is placed; the category both levels share names the function of the other. */
const TWIN_LEVEL_TOLERANCE: SclTest.BaseXmlTestCase['allowInvalidOutput'] = {
	reason:
		'the category the two levels share is copied whole with the level placed: its reference to the function of the other level names nothing',
	violations: [{ check: 'references', code: 'dangling' }],
}

/** The target of the case's file, placed or updated from `sourceQuery`: an SSD names the level the case names. */
async function lifecycleFrom(params: {
	testCase: TestCase
	sourceQuery: Scl.Query
	scenario: LifecycleScenario
	anchor?: Scl.Ref<Scl.ElementsOf>
}): Promise<LifecycleTarget> {
	const { testCase, sourceQuery, scenario, anchor = testCase.anchor } = params
	const common = { sourceQuery, anchor, scenario }
	if (testCase.verb === 'ssd') {
		const [substation] = await sourceQuery.getRecordsByTagName('Substation')
		const ref = testCase.unit
			? await findByName(sourceQuery, testCase.unit)
			: { tagName: 'Substation' as const, id: substation.id }
		return { ...common, verb: 'ssd', ref }
	}
	const tagName = testCase.verb === 'fsd' ? 'Function' : 'Application'
	const ref = await findByUuid(sourceQuery, { tagName, uuid: testCase.rootUuid ?? '' })
	return testCase.verb === 'fsd'
		? { ...common, verb: 'fsd', ref: ref as Scl.Ref<'Function'> }
		: { ...common, verb: 'asd', ref: ref as Scl.Ref<'Application'> }
}

/** Every group of a report declined. */
function declineAll(report: DiffReport): DecisionMap {
	return new Map(allGroups(report).map((group) => [group.id, 'skip' as const]))
}

/** The groups of a report whose element is an application declined, the others at their suggested action. */
function declineApplication(report: DiffReport): DecisionMap {
	return new Map(
		allGroups(report)
			.filter((group) => group.primary.tagName === 'Application')
			.map((group) => [group.id, 'skip' as const]),
	)
}

/** The groups of the first function the report lists as an instance declined, the others at their suggested action. */
function declineFirstFunction(report: DiffReport): DecisionMap {
	const [first] = report.instances.filter((instance) => instance.rootRef?.tagName === 'Function')
	return new Map((first?.groups ?? []).map((group) => [group.id, 'skip' as const]))
}

/** The decisions of each case declining some changes. */
/** The group adding a reference declined, every other group accepted — the placement of the function it would point at included. */
function declineNewReference(report: DiffReport): DecisionMap {
	return new Map(
		allGroups(report).map((group) => [
			group.id,
			group.change === 'added' && group.primary.tagName === 'FunctionRef'
				? ('skip' as const)
				: ('accept' as const),
		]),
	)
}

/**
 * Every group of the first application instance the report lists declined (its own and the placements made for it),
 * and the group adding a reference in the others.
 */
function declineFirstInstanceAndOthersReference(report: DiffReport): DecisionMap {
	const [first] = report.instances.filter((instance) => instance.rootRef?.tagName === 'Application')
	const decisions: DecisionMap = new Map()
	for (const instance of report.instances) {
		const ofFirst =
			instance.rootRef?.id === first?.rootRef?.id || instance.placedFor?.id === first?.rootRef?.id
		for (const group of instance.groups) {
			const newReference = group.change === 'added' && group.primary.tagName === 'FunctionRef'
			if (ofFirst || newReference) decisions.set(group.id, 'skip')
		}
	}
	return decisions
}

const DECLINE: Record<NonNullable<TestCase['declined']>, (report: DiffReport) => DecisionMap> = {
	'every change': declineAll,
	'the application changes': declineApplication,
	'the first function changes': declineFirstFunction,
	'the new reference, not the placement': declineNewReference,
	'the first instance, and the new reference of the other': declineFirstInstanceAndOthersReference,
}

describe('provenance follows an update: the instance records the revision of the file it now holds', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		"fsd: the function's reference names the newer version and revision, once": {
			sourceXml: fsdXml,
			targetXml: projectXml,
			verb: 'fsd',
			rootUuid: 'function-uuid',
			anchor: projectBay,
			next: { editSource: nextRevision({ version: '2', revision: 'B', changed: sourceFunction }) },
			expectedProvenance: ['function source 2/B'],
			expectedQueries: ['//default:Function[@name="Prot"][@desc="rev2"]'],
		},
		"asd: the application's reference names the newer version and revision; its function's FSD reference stays":
			{
				sourceXml: asdXml,
				targetXml: projectXml,
				verb: 'asd',
				rootUuid: 'application-uuid',
				anchor: projectBay,
				next: {
					editSource: nextRevision({ version: '2', revision: 'B', changed: sourceApplication }),
				},
				expectedProvenance: ['application source 2/B', 'function prot-library 3/1'],
				expectedQueries: ['//v2019C1:Application[@name="HMI"][@desc="rev2"]'],
			},
		'an update from a revision that changes nothing for the instance still records it': {
			sourceXml: fsdXml,
			targetXml: projectXml,
			verb: 'fsd',
			rootUuid: 'function-uuid',
			anchor: projectBay,
			next: {
				editSource: async (tx) => {
					await tx.update({ tagName: 'Header', id: 'source-header' } as Scl.Ref<'Header'>, {
						attributes: { revision: 'B' },
					})
				},
			},
			expectedProvenance: ['function source 1/B'],
		},
		'every change of the update declined: the instance still records the revision it holds': {
			sourceXml: fsdXml,
			targetXml: projectXml,
			verb: 'fsd',
			rootUuid: 'function-uuid',
			anchor: projectBay,
			next: { editSource: nextRevision({ version: '2', revision: 'B', changed: sourceFunction }) },
			declined: 'every change',
			expectedProvenance: ['function source 1/A'],
			unexpectedQueries: ['//default:Function[@desc="rev2"]'],
		},
		'asd, every change declined: the application still records the revision it holds': {
			sourceXml: asdXml,
			targetXml: projectXml,
			verb: 'asd',
			rootUuid: 'application-uuid',
			anchor: projectBay,
			next: { editSource: nextApplicationAndFunction },
			declined: 'every change',
			expectedProvenance: ['application source 1/A', 'function prot-library 3/1'],
		},
		'asd, the only change is in a function it composes, declined: the application still records the revision it holds':
			{
				sourceXml: asdXml,
				targetXml: projectXml,
				verb: 'asd',
				rootUuid: 'application-uuid',
				anchor: projectBay,
				next: {
					editSource: nextRevision({ version: '2', revision: 'B', changed: sourceFunction }),
				},
				declined: 'every change',
				expectedProvenance: ['application source 1/A', 'function prot-library 3/1'],
				unexpectedQueries: ['//default:Function[@desc="rev2"]'],
			},
		'asd, the change of a function it composes accepted, its own declined: the application records the newer revision':
			{
				sourceXml: asdXml,
				targetXml: projectXml,
				verb: 'asd',
				rootUuid: 'application-uuid',
				anchor: projectBay,
				next: { editSource: nextApplicationAndFunction },
				declined: 'the application changes',
				expectedProvenance: ['application source 2/B', 'function prot-library 3/1'],
				expectedQueries: ['//default:Function[@name="Prot"][@desc="rev2"]'],
				unexpectedQueries: ['//v2019C1:Application[@desc="rev2"]'],
			},
		'fsd fork: no element records a file': {
			sourceXml: fsdXml,
			targetXml: projectXml,
			verb: 'fsd',
			rootUuid: 'function-uuid',
			anchor: projectBay,
			scenario: 'fork',
			next: { editSource: nextRevision({ version: '2', revision: 'B', changed: sourceFunction }) },
			expectedProvenance: [],
			expectedQueries: ['//default:Function[@uuid="function-uuid"][@desc="rev2"]'],
		},
		'asd fork: no element records a file of its own, the function keeps the FSD reference the file holds':
			{
				sourceXml: asdXml,
				targetXml: projectXml,
				verb: 'asd',
				rootUuid: 'application-uuid',
				anchor: projectBay,
				scenario: 'fork',
				next: {
					editSource: nextRevision({ version: '2', revision: 'B', changed: sourceApplication }),
				},
				expectedProvenance: ['function prot-library 3/1'],
				expectedQueries: ['//v2019C1:Application[@uuid="application-uuid"][@desc="rev2"]'],
			},
		'ssd, every change declined: the Header lists only the revision placed': {
			sourceXml: ssdXml,
			targetXml: projectXml,
			verb: 'ssd',
			anchor: projectVoltageLevel,
			next: {
				editSource: nextRevision({
					version: '0',
					revision: '2',
					changed: { tagName: 'Bay', id: 'source-feeder' } as Scl.Ref<'Bay'>,
				}),
			},
			declined: 'every change',
			expectedProvenance: ['document source 0/1'],
		},
		'fsd: an element the project added is not a change the newer revision brings: the reference names it':
			{
				sourceXml: fsdXml,
				targetXml: projectXml,
				verb: 'fsd',
				rootUuid: 'function-uuid',
				anchor: projectBay,
				editProject: async (tx) => {
					const [placed] = await tx.findByAttributes({
						tagName: 'Function',
						attributes: { templateUuid: 'function-uuid' },
					})
					await tx.addChild(placed, {
						tagName: 'LNode',
						attributes: { iedName: 'None', lnClass: 'GGIO', lnInst: '9', uuid: 'user-lnode-uuid' },
					})
				},
				next: {
					editSource: async (tx) => {
						await tx.update({ tagName: 'Header', id: 'source-header' } as Scl.Ref<'Header'>, {
							attributes: { revision: 'B' },
						})
					},
				},
				expectedProvenance: ['function source 1/B'],
				expectedQueries: ['//default:Function/default:LNode[@uuid="user-lnode-uuid"]'],
			},
		'fsd updated by the update verb with the report and no decisions: every change written, the newer revision recorded':
			{
				sourceXml: fsdXml,
				targetXml: projectXml,
				verb: 'fsd',
				rootUuid: 'function-uuid',
				anchor: projectBay,
				next: {
					editSource: nextRevision({ version: '2', revision: 'B', changed: sourceFunction }),
				},
				updatedDirectly: true,
				expectedProvenance: ['function source 2/B'],
				expectedQueries: ['//default:Function[@name="Prot"][@desc="rev2"]'],
			},
		'asd, its only change declined: the application still records the revision it holds': {
			sourceXml: asdXml,
			targetXml: projectXml,
			verb: 'asd',
			rootUuid: 'application-uuid',
			anchor: projectBay,
			next: {
				editSource: nextRevision({ version: '2', revision: 'B', changed: sourceApplication }),
			},
			declined: 'the application changes',
			expectedProvenance: ['application source 1/A', 'function prot-library 3/1'],
			unexpectedQueries: ['//v2019C1:Application[@desc="rev2"]'],
		},
		"asd, two instances, one function's change declined: that instance keeps its revision, the other records the newer":
			{
				sourceXml: asdXml,
				targetXml: twoBaysProjectXml,
				verb: 'asd',
				rootUuid: 'application-uuid',
				anchor: projectBay,
				placedUnder: [projectBay, projectOtherBay],
				next: {
					editSource: nextRevision({ version: '2', revision: 'B', changed: sourceFunction }),
				},
				declined: 'the first function changes',
				expectedProvenance: [
					'application source 1/A',
					'application source 2/B',
					'function prot-library 3/1',
					'function prot-library 3/1',
				],
				expectedQueries: ['//default:Function[@desc="rev2"]'],
			},
		'asd, a function gained and placed while the reference to it is declined: the application records the newer revision':
			{
				sourceXml: asdXml,
				targetXml: projectXml,
				verb: 'asd',
				rootUuid: 'application-uuid',
				anchor: projectBay,
				next: { editSource: nextGainingControl },
				declined: 'the new reference, not the placement',
				expectedProvenance: ['application source 2/B', 'function prot-library 3/1'],
				expectedQueries: ['//default:Function[@name="Ctrl"][@templateUuid="control-uuid"]'],
				unexpectedQueries: ['//v2019C1:FunctionRef[contains(@function, "/Ctrl")]'],
			},
		'asd, two instances gaining a function: the one declining it all keeps its revision, the one placing it without its reference records the newer':
			{
				sourceXml: asdXml,
				targetXml: twoBaysProjectXml,
				verb: 'asd',
				rootUuid: 'application-uuid',
				anchor: projectBay,
				placedUnder: [projectBay, projectOtherBay],
				next: { editSource: nextGainingControl },
				declined: 'the first instance, and the new reference of the other',
				expectedProvenance: [
					'application source 1/A',
					'application source 2/B',
					'function prot-library 3/1',
					'function prot-library 3/1',
				],
				expectedQueries: [
					'//default:Function[@name="Ctrl"][@templateUuid="control-uuid"]',
					// the instance recording the newer revision is the one the function was placed for, in its bay
					'//v2019C1:Application[v2019C1:ApplicationSclRef/v2019C1:SclFileReference[@revision="B"]][.//v2019C1:FunctionRef[contains(@function, concat("/", //default:Bay[default:Function[@name="Ctrl"]]/@name, "/"))]]',
				],
				unexpectedQueries: [
					'//default:Function[@name="Ctrl"][2]',
					'//v2019C1:FunctionRef[contains(@function, "/Ctrl")]',
				],
			},
		"ssd: the project's Header lists the newer revision after the one placed, a file version once":
			{
				sourceXml: ssdXml,
				targetXml: projectXml,
				verb: 'ssd',
				anchor: projectVoltageLevel,
				next: {
					editSource: nextRevision({
						version: '0',
						revision: '2',
						changed: { tagName: 'Bay', id: 'source-feeder' } as Scl.Ref<'Bay'>,
					}),
				},
				updatedTwice: true,
				expectedProvenance: ['document source 0/1', 'document source 0/2'],
				expectedQueries: [
					'//default:Header/default:SourceFiles/default:SclFileReference[1][@revision="1"]',
					'//default:Header/default:SourceFiles/default:SclFileReference[2][@revision="2"]',
				],
			},
		"ssd fork: the project's Header lists the newer revision, no element records a file": {
			sourceXml: ssdXml,
			targetXml: projectXml,
			verb: 'ssd',
			anchor: projectVoltageLevel,
			scenario: 'fork',
			next: {
				editSource: nextRevision({
					version: '0',
					revision: '2',
					changed: { tagName: 'Bay', id: 'source-feeder' } as Scl.Ref<'Bay'>,
				}),
			},
			expectedProvenance: ['document source 0/1', 'document source 0/2'],
		},
		'asd twin: the application gaining elements records its second revision, its subfunctions their FSDs':
			{
				sourceXml: readRevisionTwin({ twin: 'applicationGainsElements', revision: 1 }),
				targetXml: projectXml,
				verb: 'asd',
				rootUuid: '00000000-0000-4000-8000-000000000210',
				anchor: projectBay,
				next: { sourceXml: readRevisionTwin({ twin: 'applicationGainsElements', revision: 2 }) },
				expectedProvenance: [
					'application next revision 0/2',
					'function time-overcurrent 0/1',
					'function trip-conditioning 0/1',
				],
				unexpectedQueries: [
					'//default:Function[@name="Overcurrent_Fn"]/default:Private/v2019C1:FunctionSclRef',
				],
			},
		'fsd twin: the function whose type gains data records its second revision': {
			sourceXml: readRevisionTwin({ twin: 'functionTypeGainsData', revision: 1 }),
			targetXml: projectXml,
			verb: 'fsd',
			rootUuid: '00000000-0000-4000-8000-000000000310',
			anchor: projectBay,
			next: { sourceXml: readRevisionTwin({ twin: 'functionTypeGainsData', revision: 2 }) },
			expectedProvenance: ['function next revision 2/2'],
		},
		"ssd twin: the Header lists both revisions, the applications keep their application files' references":
			{
				sourceXml: readRevisionTwin({ twin: 'twoLevelBayTemplate', revision: 1 }),
				targetXml: projectXml,
				verb: 'ssd',
				anchor: projectVoltageLevel,
				next: { sourceXml: readRevisionTwin({ twin: 'twoLevelBayTemplate', revision: 2 }) },
				unit: { tagName: 'VoltageLevel', name: 'TEMPLATE_HV' },
				allowInvalidOutput: TWIN_LEVEL_TOLERANCE,
				// the newer revision links the two levels (an input of one fed by the other): the update brings the second
				expectedProvenance: [
					'application breaker_application 1/2',
					'application breaker_application 1/2',
					'application overcurrent_application 0/1',
					'document next revision 0/2',
					'document source 0/1',
					'function breaker 2/2',
					'function breaker 2/2',
					'function conditioner 0/1',
					'function conditioner 0/1',
					'function device 1/1',
					'function device 1/1',
					'function output 1/1',
					'function output 1/1',
					'function time-overcurrent 0/1',
					'function trip-conditioning 0/1',
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
		for (const anchor of testCase.placedUnder ?? [testCase.anchor]) {
			const lifecycle = await lifecycleFrom({
				testCase,
				sourceQuery: source.query,
				scenario: testCase.scenario ?? 'instantiate',
				anchor,
			})
			await reportAndApply({ document: target, lifecycle })
		}
		if (testCase.editProject) await target.transaction(testCase.editProject)

		const { sourceXml, editSource } = testCase.next
		if (editSource) await source.transaction(editSource)
		const newer = sourceXml
			? await openSclDocument({ project, xml: sourceXml, label: 'next revision' })
			: source
		const update = await lifecycleFrom({
			testCase,
			sourceQuery: newer.query,
			scenario: testCase.scenario ?? 'template',
		})
		if (testCase.updatedDirectly && update.verb === 'fsd') {
			const reported = await reportUpdate(target.query, update)
			await target.transaction(async function updateDirectly(tx) {
				await updateFsd(tx, {
					sourceQuery: update.sourceQuery,
					functionRef: update.ref,
					targetParent: update.anchor,
					report: reported,
				})
			})
		} else {
			await reportAndApply({
				document: target,
				lifecycle: update,
				...(testCase.declined ? { decide: DECLINE[testCase.declined] } : {}),
			})
		}
		if (testCase.updatedTwice) await reportAndApply({ document: target, lifecycle: update })

		const entries = await reference.query.getProvenance(target.query)
		const listed = entries.map(
			(entry) => `${entry.anchor.kind} ${entry.fileName ?? ''} ${entry.version}/${entry.revision}`,
		)
		expect(listed.sort()).toEqual(testCase.expectedProvenance)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
