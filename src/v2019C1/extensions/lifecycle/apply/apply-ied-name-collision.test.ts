import isdInstanceOfBcu1 from '../integration/ied/fixtures/isd-instance-of-bcu1-from-project-north.xml?raw'
import vendorIcd from './fixtures/icd-p1-of-the-2007-b-4-edition-on-w1-with-its-own-subnetwork-settings.xml?raw'
import projectHoldingTemplate from './fixtures/project-holding-ieds-template-and-template-1.xml?raw'
import projectOnBareW1 from './fixtures/project-on-w1-without-settings.xml?raw'
import projectWithAnotherBcu1 from './fixtures/project-west-with-another-bcu1.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { readAttribute } from '@/v2019C1/helpers'
import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type {
	IedCollisions,
	LifecycleScenario,
} from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionGroup, GroupDecision } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

type CollisionCase = SclTest.BaseXmlTestCase & {
	sourceFileName: string
	scenario?: LifecycleScenario
	collisions?: IedCollisions
	/** The consumer's decision on the IED group. */
	decision: GroupDecision
	expectedGroup: Pick<DecisionGroup, 'requiresDecision' | 'needsName'>
	/** The refusal the apply ends with. Absent: the apply writes. */
	expectedRefusal?: { key: string; meta: Record<string, unknown> }
}

// The name of a placed IED another IED of the project holds is numbered by default (a placement stamping the template's
// identity); with `collisions: 'refuse'` the report asks for a name instead, proposing the one numbering would write,
// and the apply places the IED under the name chosen, refusing a name the project holds, nothing written.
describe('tx.lifecycle.apply - the name of a placed IED the project holds', () => {
	const testCases: SclTest.TestCases<CollisionCase> = {
		// vendorIcd: 2007 B 4, no uuid, Header without one, IED TEMPLATE (ACME P1, no original edition) on W1 with the vendor's bit rate 10, text and private data
		'the vendor ICD, its IED TEMPLATE taken, by default → numbered TEMPLATE_2, no decision asked': {
			sourceXml: vendorIcd,
			targetXml: projectHoldingTemplate,
			sourceFileName: 'P1.icd',
			expectedGroup: {},
			decision: 'accept',
			expectedQueries: [
				'/default:SCL[count(default:IED)=3]/default:IED[@name="TEMPLATE_2"][@manufacturer="ACME"]',
			],
		},
		// vendorIcd: 2007 B 4, no uuid, Header without one, IED TEMPLATE (ACME P1, no original edition) on W1 with the vendor's bit rate 10, text and private data
		'the vendor ICD, its IED TEMPLATE taken, collisions refuse, the proposal chosen → the report asks for a name proposing TEMPLATE_2, placed under it':
			{
				sourceXml: vendorIcd,
				targetXml: projectHoldingTemplate,
				sourceFileName: 'P1.icd',
				collisions: 'refuse',
				decision: { action: 'accept', values: { name: 'TEMPLATE_2' } },
				expectedGroup: {
					requiresDecision: 'name-taken',
					needsName: { taken: 'TEMPLATE', proposal: 'TEMPLATE_2' },
				},
				expectedQueries: [
					'/default:SCL[count(default:IED)=3]/default:IED[@name="TEMPLATE_2"][@manufacturer="ACME"]',
				],
			},
		// vendorIcd: 2007 B 4, no uuid, Header without one, IED TEMPLATE (ACME P1, no original edition) on W1 with the vendor's bit rate 10, text and private data
		'the vendor ICD, its IED TEMPLATE taken, collisions refuse, BAY1_P1 chosen → placed as BAY1_P1':
			{
				sourceXml: vendorIcd,
				targetXml: projectHoldingTemplate,
				sourceFileName: 'P1.icd',
				collisions: 'refuse',
				decision: { action: 'accept', values: { name: 'BAY1_P1' } },
				expectedGroup: {
					requiresDecision: 'name-taken',
					needsName: { taken: 'TEMPLATE', proposal: 'TEMPLATE_2' },
				},
				expectedQueries: [
					'/default:SCL[count(default:IED)=3]/default:IED[@name="BAY1_P1"][@manufacturer="ACME"]',
				],
			},
		// vendorIcd: 2007 B 4, no uuid, Header without one, IED TEMPLATE (ACME P1, no original edition) on W1 with the vendor's bit rate 10, text and private data
		'the vendor ICD, collisions refuse, TEMPLATE_1 chosen, taken too → refused IED_NAME_TAKEN, nothing written':
			{
				sourceXml: vendorIcd,
				targetXml: projectHoldingTemplate,
				sourceFileName: 'P1.icd',
				collisions: 'refuse',
				decision: { action: 'accept', values: { name: 'TEMPLATE_1' } },
				expectedGroup: {
					requiresDecision: 'name-taken',
					needsName: { taken: 'TEMPLATE', proposal: 'TEMPLATE_2' },
				},
				expectedRefusal: { key: 'IED_NAME_TAKEN', meta: { name: 'TEMPLATE_1' } },
				expectedQueries: ['/default:SCL[count(default:IED)=2]'],
			},
		// vendorIcd: 2007 B 4, no uuid, Header without one, IED TEMPLATE (ACME P1, no original edition) on W1 with the vendor's bit rate 10, text and private data
		'the vendor ICD, collisions refuse, accepted with no name → refused IED_NAME_TAKEN for TEMPLATE, nothing written':
			{
				sourceXml: vendorIcd,
				targetXml: projectHoldingTemplate,
				sourceFileName: 'P1.icd',
				decision: { action: 'accept' },
				collisions: 'refuse',
				expectedGroup: {
					requiresDecision: 'name-taken',
					needsName: { taken: 'TEMPLATE', proposal: 'TEMPLATE_2' },
				},
				expectedRefusal: { key: 'IED_NAME_TAKEN', meta: { name: 'TEMPLATE' } },
				expectedQueries: ['/default:SCL[count(default:IED)=2]'],
			},
		// isdInstanceOfBcu1: an ISD instance whose IED is named BCU1, placed as a fork
		'an ISD instance of BCU1 placed as a fork where another IED is named BCU1, by default → the report asks for a name proposing BCU1_1, placed under it':
			{
				sourceXml: isdInstanceOfBcu1,
				targetXml: projectWithAnotherBcu1,
				sourceFileName: 'BCU1.isd',
				scenario: 'fork',
				decision: { action: 'accept', values: { name: 'BCU1_1' } },
				expectedGroup: {
					requiresDecision: 'name-taken',
					needsName: { taken: 'BCU1', proposal: 'BCU1_1' },
				},
				expectedQueries: [
					'/default:SCL[count(default:IED)=2]/default:IED[@name="BCU1"][@uuid="e0000000-0000-4000-8000-000000000030"]',
					'/default:SCL/default:IED[@name="BCU1_1"][@uuid="b0000000-0000-4000-8000-000000000030"]',
				],
			},
		// vendorIcd: 2007 B 4, no uuid, Header without one, IED TEMPLATE (ACME P1, no original edition) on W1 with the vendor's bit rate 10, text and private data
		'the vendor ICD, collisions refuse, its name free → no decision, placed as TEMPLATE': {
			sourceXml: vendorIcd,
			targetXml: projectOnBareW1,
			sourceFileName: 'P1.icd',
			collisions: 'refuse',
			expectedGroup: {},
			decision: 'accept',
			expectedQueries: [
				'/default:SCL[count(default:IED)=2]/default:IED[@name="TEMPLATE"][@manufacturer="ACME"]',
			],
		},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<CollisionCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const sourceQuery = await importSource({
			project,
			xml: testCase.sourceXml,
			fileName: testCase.sourceFileName,
		})
		const lifecycle = {
			verb: 'ied',
			sourceQuery,
			ref: await onlyIed({ sourceQuery }),
			anchor: await projectRoot(target.query),
			scenario: testCase.scenario,
			collisions: testCase.collisions,
		} as const
		const report = await target.query.lifecycle.report(lifecycle)
		const [iedGroup] = report.instances.flatMap((instance) => instance.groups)
		if (!iedGroup) throw new Error('the report lists no IED group')
		expect({
			...(iedGroup.requiresDecision ? { requiresDecision: iedGroup.requiresDecision } : {}),
			...(iedGroup.needsName ? { needsName: iedGroup.needsName } : {}),
		}).toEqual(testCase.expectedGroup)
		const refusal = await target
			.transaction(async function applyIed(tx) {
				await tx.lifecycle.apply({
					...lifecycle,
					report,
					resolution: { decisions: new Map([[iedGroup.id, testCase.decision]]) },
				})
			})
			.then(
				() => undefined,
				(error: unknown) => toDialecteError(error),
			)
		expect(refusal && { key: refusal.key, meta: refusal.meta }).toEqual(testCase.expectedRefusal)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

type UndecidedCase = SclTest.BaseXmlTestCase & {
	sourceFileName: string
	/** The decisions given on the IED group, in order (none: the group left out of the decisions). */
	decisions: readonly GroupDecision[]
	expectedRefusal?: { key: string; meta: Record<string, unknown> }
}

// A placement waiting for a name needs a decision: the report is no longer on the fast track; left out of the decisions
// the apply is refused before anything is written; skipped, nothing is placed.
describe('tx.lifecycle.apply - a placement waiting for a name, undecided or skipped', () => {
	const testCases: SclTest.TestCases<UndecidedCase> = {
		// vendorIcd: its IED TEMPLATE, a name the project holds; collisions refuse
		'collisions refuse, the IED group left out of the decisions → the report needs decisions, refused DECISION_REQUIRED, nothing written':
			{
				sourceXml: vendorIcd,
				targetXml: projectHoldingTemplate,
				sourceFileName: 'P1.icd',
				decisions: [],
				expectedRefusal: { key: 'DECISION_REQUIRED', meta: { groupIds: expect.any(Array) } },
				expectedQueries: ['/default:SCL[count(default:IED)=2]'],
			},
		// vendorIcd: its IED TEMPLATE, a name the project holds; collisions refuse
		'collisions refuse, the IED group skipped → the report needs decisions, nothing placed': {
			sourceXml: vendorIcd,
			targetXml: projectHoldingTemplate,
			sourceFileName: 'P1.icd',
			decisions: ['skip'],
			expectedQueries: ['/default:SCL[count(default:IED)=2][not(default:DataTypeTemplates)]'],
		},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<UndecidedCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const sourceQuery = await importSource({
			project,
			xml: testCase.sourceXml,
			fileName: testCase.sourceFileName,
		})
		const ref = await onlyIed({ sourceQuery })
		const anchor = await projectRoot(target.query)
		const lifecycle = { verb: 'ied', sourceQuery, ref, anchor, collisions: 'refuse' } as const
		const report = await target.query.lifecycle.report(lifecycle)
		expect(report.needsDecisions).toBe(true)
		const groupIds = report.instances
			.flatMap((instance) => instance.groups)
			.map((group) => group.id)
		const decisions = new Map(
			testCase.decisions.map((decision, index) => [groupIds[index] ?? '', decision]),
		)
		const refusal = await target
			.transaction(async function applyIed(tx) {
				await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
			})
			.then(
				() => undefined,
				(error: unknown) => toDialecteError(error),
			)
		expect(refusal && { key: refusal.key, meta: refusal.meta }).toEqual(testCase.expectedRefusal)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

type UpdatePlacementCase = SclTest.BaseXmlTestCase & {
	collisions?: IedCollisions
	expectedRefusal?: { key: string; meta: Record<string, unknown> }
}

// `update.ied` placing an IED as a fork into a project holding none of it (a first placement) follows `collisions`: the
// fork default refuses a taken name, `number` numbers it.
describe('tx.lifecycle.update.ied - a fork placement whose IED name the project holds', () => {
	const testCases: SclTest.TestCases<UpdatePlacementCase> = {
		// isdInstanceOfBcu1: an ISD instance whose IED is named BCU1, the project's own BCU1 another IED
		'the instance ISD of BCU1, by default → refused IED_NAME_TAKEN for BCU1, nothing written': {
			sourceXml: isdInstanceOfBcu1,
			targetXml: projectWithAnotherBcu1,
			expectedRefusal: { key: 'IED_NAME_TAKEN', meta: { name: 'BCU1' } },
			expectedQueries: [
				'/default:SCL[count(default:IED)=1]/default:IED[@name="BCU1"][@uuid="e0000000-0000-4000-8000-000000000030"]',
			],
		},
		// isdInstanceOfBcu1: an ISD instance whose IED is named BCU1, the project's own BCU1 another IED
		'the instance ISD of BCU1, collisions number → placed as BCU1_1 with its own uuid': {
			sourceXml: isdInstanceOfBcu1,
			targetXml: projectWithAnotherBcu1,
			collisions: 'number',
			expectedQueries: [
				'/default:SCL/default:IED[@name="BCU1_1"][@uuid="b0000000-0000-4000-8000-000000000030"]',
			],
		},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<UpdatePlacementCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const sourceQuery = await importSource({
			project,
			xml: testCase.sourceXml,
			fileName: 'BCU1.isd',
		})
		const iedRef = await onlyIed({ sourceQuery })
		const anchor = await projectRoot(target.query)
		const refusal = await target
			.transaction(async function updateIed(tx) {
				await tx.lifecycle.update.ied({
					sourceQuery,
					iedRef,
					anchor,
					fileType: 'ISD',
					scenario: 'fork',
					collisions: testCase.collisions,
				})
			})
			.then(
				() => undefined,
				(error: unknown) => toDialecteError(error),
			)
		expect(refusal && { key: refusal.key, meta: refusal.meta }).toEqual(testCase.expectedRefusal)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** A source file imported into the test project, by name, as a read query. */
async function importSource(params: {
	project: SclTest.ActParams<SclTest.BaseXmlTestCase>['project']
	xml: string
	fileName: string
}): Promise<Core.Query<Config>> {
	const { project, xml, fileName } = params
	const imported = await project.importFile(new File([xml], fileName, { type: 'text/xml' }))
	return project.openDocument(imported.documentId).query
}

/** The first IED of a source file. */
async function onlyIed(params: { sourceQuery: Core.Query<Config> }): Promise<Scl.Ref<'IED'>> {
	const [ied] = await params.sourceQuery.getRecordsByTagName('IED')
	if (!ied || !readAttribute({ record: ied, name: 'name' }))
		throw new Error('the source holds no IED')
	return { tagName: 'IED', id: ied.id }
}

/** The root of the project the IED is placed under. */
async function projectRoot(query: Core.Query<Config>): Promise<Scl.Ref<'SCL'>> {
	const root = await query.getRoot()
	return { tagName: 'SCL', id: root.id }
}
