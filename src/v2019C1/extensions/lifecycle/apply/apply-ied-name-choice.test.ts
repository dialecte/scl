import isdInstanceOfBcu1 from '../integration/ied/fixtures/isd-instance-of-bcu1-from-project-north.xml?raw'
import vendorIcd from './fixtures/icd-p1-of-the-2007-b-4-edition-on-w1-with-its-own-subnetwork-settings.xml?raw'
import projectHoldingTemplate from './fixtures/project-holding-ieds-template-and-template-1.xml?raw'
import projectOnBareW1 from './fixtures/project-on-w1-without-settings.xml?raw'
import projectWithAnotherBcu1 from './fixtures/project-west-with-another-bcu1.xml?raw'
import { importSource, onlyIed, projectRoot } from './ied-placement-test-steps'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { IedCollisions } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { GroupDecision } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

type ChoiceCase = SclTest.BaseXmlTestCase & {
	/** What the report is asked with. */
	collisions?: IedCollisions
	/** What the apply is asked with. */
	applyCollisions?: IedCollisions
	/** The consumer's decision on the IED group. */
	decision: GroupDecision
	/** The refusal the apply ends with. Absent: the apply writes. */
	expectedRefusal?: { key: string; meta: Record<string, unknown> }
}

// The name a placed IED takes must be an IED name: the one the consumer chooses is checked against the IED name type
// (no empty name, not the reserved None); with `collisions: 'refuse'` the type name TEMPLATE is no name for a placed
// IED, so accepting it unnamed is refused; and the apply places with the collisions its report was made with.
describe('tx.lifecycle.apply - the name chosen for a placed IED', () => {
	const testCases: SclTest.TestCases<ChoiceCase> = {
		// vendorIcd: IED TEMPLATE (ACME P1); projectOnBareW1: no IED TEMPLATE
		'the vendor ICD, collisions refuse, its name TEMPLATE free, accepted with no name → refused IED_NAME_INVALID for TEMPLATE, nothing written':
			{
				sourceXml: vendorIcd,
				targetXml: projectOnBareW1,
				collisions: 'refuse',
				applyCollisions: 'refuse',
				decision: { action: 'accept' },
				expectedRefusal: { key: 'IED_NAME_INVALID', meta: { name: 'TEMPLATE', issue: 'template' } },
				expectedQueries: ['/default:SCL[count(default:IED)=1]'],
			},
		// vendorIcd: IED TEMPLATE, a name projectHoldingTemplate holds
		'the vendor ICD, collisions refuse, None chosen → refused IED_NAME_INVALID for None, nothing written':
			{
				sourceXml: vendorIcd,
				targetXml: projectHoldingTemplate,
				collisions: 'refuse',
				applyCollisions: 'refuse',
				decision: { action: 'accept', values: { name: 'None' } },
				expectedRefusal: { key: 'IED_NAME_INVALID', meta: { name: 'None', issue: 'pattern' } },
				expectedQueries: ['/default:SCL[count(default:IED)=2]'],
			},
		// vendorIcd: IED TEMPLATE, a name projectHoldingTemplate holds
		'the vendor ICD, numbered by default, 1P1 chosen → refused IED_NAME_INVALID for 1P1, nothing written':
			{
				sourceXml: vendorIcd,
				targetXml: projectHoldingTemplate,
				decision: { action: 'accept', values: { name: '1P1' } },
				expectedRefusal: { key: 'IED_NAME_INVALID', meta: { name: '1P1', issue: 'datatype' } },
				expectedQueries: ['/default:SCL[count(default:IED)=2]'],
			},
		// vendorIcd: IED TEMPLATE, a name projectHoldingTemplate holds
		'a report made with collisions refuse, applied without collisions → refused REPORT_TARGET_MISMATCH on collisions, nothing written':
			{
				sourceXml: vendorIcd,
				targetXml: projectHoldingTemplate,
				collisions: 'refuse',
				decision: { action: 'accept', values: { name: 'BAY1_P1' } },
				expectedRefusal: { key: 'REPORT_TARGET_MISMATCH', meta: { field: 'collisions' } },
				expectedQueries: ['/default:SCL[count(default:IED)=2]'],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<ChoiceCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const sourceQuery = await importSource({ project, xml: testCase.sourceXml, fileName: 'P1.icd' })
		const lifecycle = {
			verb: 'ied',
			sourceQuery,
			ref: await onlyIed({ sourceQuery }),
			anchor: await projectRoot(target.query),
			collisions: testCase.collisions,
		} as const
		const report = await target.query.lifecycle.report(lifecycle)
		const [iedGroup] = report.instances.flatMap((instance) => instance.groups)
		if (!iedGroup) throw new Error('the report lists no IED group')
		const refusal = await target
			.transaction(async function applyIed(tx) {
				await tx.lifecycle.apply({
					...lifecycle,
					collisions: testCase.applyCollisions,
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

type UpdateChoiceCase = SclTest.BaseXmlTestCase & {
	/** The name the decision on the IED group gives. */
	name: string
	/** What `update.ied` is asked with; the report is made with the fork's default. */
	collisions?: IedCollisions
	expectedRefusal?: { key: string; meta: Record<string, unknown> }
}

// `update.ied` placing an IED as a fork into a project holding none of it, given the report and decisions, places the
// IED under the name the decision gives, refusing one the project holds.
describe('tx.lifecycle.update.ied - a fork placement named by its decision', () => {
	const testCases: SclTest.TestCases<UpdateChoiceCase> = {
		// isdInstanceOfBcu1: an ISD instance whose IED is named BCU1, the project's own BCU1 another IED
		'the instance ISD of BCU1, its decision naming BCU1_WEST, free → placed as BCU1_WEST with its own uuid':
			{
				sourceXml: isdInstanceOfBcu1,
				targetXml: projectWithAnotherBcu1,
				name: 'BCU1_WEST',
				expectedQueries: [
					'/default:SCL[count(default:IED)=2]/default:IED[@name="BCU1_WEST"][@uuid="b0000000-0000-4000-8000-000000000030"]',
				],
			},
		// isdInstanceOfBcu1: an ISD instance whose IED is named BCU1, the project's own BCU1 another IED
		'a report made with the fork default, update.ied asked with collisions number → refused REPORT_TARGET_MISMATCH on collisions, nothing written':
			{
				sourceXml: isdInstanceOfBcu1,
				targetXml: projectWithAnotherBcu1,
				name: 'BCU1_WEST',
				collisions: 'number',
				expectedRefusal: { key: 'REPORT_TARGET_MISMATCH', meta: { field: 'collisions' } },
				expectedQueries: ['/default:SCL[count(default:IED)=1]'],
			},
		// isdInstanceOfBcu1: an ISD instance whose IED is named BCU1, the project's own BCU1 another IED
		'the instance ISD of BCU1, its decision naming BCU1, taken → refused IED_NAME_TAKEN for BCU1, nothing written':
			{
				sourceXml: isdInstanceOfBcu1,
				targetXml: projectWithAnotherBcu1,
				name: 'BCU1',
				expectedRefusal: { key: 'IED_NAME_TAKEN', meta: { name: 'BCU1' } },
				expectedQueries: [
					'/default:SCL[count(default:IED)=1]/default:IED[@name="BCU1"][@uuid="e0000000-0000-4000-8000-000000000030"]',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<UpdateChoiceCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const sourceQuery = await importSource({
			project,
			xml: testCase.sourceXml,
			fileName: 'BCU1.isd',
		})
		const iedRef = await onlyIed({ sourceQuery })
		const anchor = await projectRoot(target.query)
		const report = await target.query.lifecycle.report({
			verb: 'ied',
			sourceQuery,
			ref: iedRef,
			anchor,
			scenario: 'fork',
		})
		const iedGroup = report.instances
			.flatMap((instance) => instance.groups)
			.find((group) => group.primary.tagName === 'IED')
		if (!iedGroup) throw new Error('the report lists no IED group')
		const decisions = new Map<string, GroupDecision>([
			[iedGroup.id, { action: 'accept', values: { name: testCase.name } }],
		])
		const refusal = await target
			.transaction(async function forkIed(tx) {
				await tx.lifecycle.update.ied({
					sourceQuery,
					iedRef,
					anchor,
					fileType: 'ISD',
					scenario: 'fork',
					collisions: testCase.collisions,
					report,
					decisions,
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
