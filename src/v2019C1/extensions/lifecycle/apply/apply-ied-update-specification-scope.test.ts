import isdTemplateDescribingProtection from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised-describing-its-protection.xml?raw'
import isdTemplateSupervised from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised-with-a-supervision-function.xml?raw'
import isdTemplateWithoutBayControl from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised-without-bay-control.xml?raw'
import isdTemplateRevised from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised.xml?raw'
import isdTemplateNamedLevelWithoutBayControl from '../integration/ied/fixtures/isd-template-of-a-bay-controller-with-its-voltage-level-named-revised-without-bay-control.xml?raw'
import projectNorthOwnLNodeOnBcu2 from '../integration/ied/fixtures/project-north-with-an-own-lnode-of-line-protection-bound-to-bcu2.xml?raw'
import projectNorthWithForeignFunction from '../integration/ied/fixtures/project-north-with-bcu1-and-a-function-of-another-file-bound-to-it.xml?raw'
import projectNorthQ01Placed from '../integration/ied/fixtures/project-north-with-q01-placed-from-the-template-bay.xml?raw'
import projectNorthBayControlOnBcu2 from '../integration/ied/fixtures/project-north-with-the-bay-control-bound-to-bcu2.xml?raw'
import projectNorthSpecificationOnNoBay from '../integration/ied/fixtures/project-north-with-the-specification-of-bcu1-on-no-bay.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

type WaitingCase = SclTest.BaseXmlTestCase & {
	/** The groups waiting for a decision: `<tag> <change> <reason>`, sorted. */
	waiting: string[]
}

// The specification of an IED is what its placement specified on it: an LNode keeps the IED it is specified on
// (its LNodeSpecNaming) when the project binds it elsewhere. A function another file placed is no part of it, whatever
// the project bound its LNodes to; a function of the placement whose LNodes the project bound to another IED still is.
describe('tx.lifecycle.apply - an S-IED update, its specification told by what is specified on it', () => {
	const testCases: SclTest.TestCases = {
		'Q01 also holding Metering from another file, its LNode bound to the LPHD of BCU1, every group at its suggested action → Metering and its LNode kept, BCU1’s specification updated':
			{
				// Metering (9…040, lineage c…040) holds the LNode 9…041 bound to BCU1's LPHD, specified on no IED
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthWithForeignFunction,
				expectedQueries: [
					'//default:Bay[@name="Q01"]/default:Function[@name="Metering"][@uuid="90000000-0000-4000-8000-000000000040"]/default:LNode[@uuid="90000000-0000-4000-8000-000000000041"][@iedName="BCU1"]',
					'//default:Function[@name="LineProtection"]/default:LNode[@templateUuid="a0000000-0000-4000-8000-000000000015"][@iedName="BCU1"]',
				],
			},
		'both LNodes of BayControl bound to BCU2, still specified on BCU1, the revision keeping BayControl → one BayControl, its LNodes still bound to BCU2':
			{
				// BayControl (b…004) holds b…011 and b…012, bound by the project to BCU2's CSWI and CILO
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthBayControlOnBcu2,
				expectedQueries: [
					'//default:Bay[@name="Q01"][count(default:Function[@templateUuid="a0000000-0000-4000-8000-000000000004"])=1]/default:Function[@uuid="b0000000-0000-4000-8000-000000000004"][count(default:LNode[@iedName="BCU2"])=2]',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		const groups = report.instances.flatMap((instance) => instance.groups)
		const decisions = new Map(groups.map((group) => [group.id, group.suggestedAction] as const))
		await target.transaction(async function applyUpdate(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// A function of the placement dropped by the revision, every LNode of it bound by the project to another IED: its
// removal waits for a decision, as when one of its LNodes is.
describe('query.lifecycle.report - an S-IED update dropping a function wholly bound to another IED', () => {
	const testCases: SclTest.TestCases<WaitingCase> = {
		'the revision dropping BayControl, both its LNodes bound to BCU2 → the removal of BayControl waits for a decision':
			{
				sourceXml: isdTemplateWithoutBayControl,
				targetXml: projectNorthBayControlOnBcu2,
				waiting: ['Function target-only unbinds-another-ied'],
			},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<WaitingCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		const waiting = report.instances
			.flatMap((instance) => instance.groups)
			.filter((group) => group.requiresDecision)
			.map((group) => `${group.primary.tagName} ${group.change} ${group.requiresDecision}`)
		expect(waiting.sort()).toEqual(testCase.waiting)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type DroppedCase = SclTest.BaseXmlTestCase & {
	/** The groups of the specification removing a function: `<change> <uuid>`, sorted. */
	removals: string[]
}

// Below a level the template's unit was mapped onto, a level the placement made from the unit is the unit's: a function
// on it the revision drops is removed, as on any level the placement made.
describe('query.lifecycle.report - an S-IED update dropping a function of a bay the placement made', () => {
	const testCases: SclTest.TestCases<DroppedCase> = {
		'the unit the voltage level (named E1, its bay Q01), E1 mapped, Q01 placed from the template bay, the revision dropping BayControl → BayControl removed':
			{
				// Q01 (b…003) carries the template bay's lineage (a…003); BayControl (b…004) holds LNodes specified on BCU1
				sourceXml: isdTemplateNamedLevelWithoutBayControl,
				targetXml: projectNorthQ01Placed,
				removals: ['removed b0000000-0000-4000-8000-000000000004'],
			},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<DroppedCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		const removals = report.instances
			.flatMap((instance) => instance.groups)
			.filter((group) => group.primary.tagName === 'Function' && group.change !== 'added')
		const records = await target.query.any.getRecords(
			removals.flatMap((group) => (group.primary.instanceRef ? [group.primary.instanceRef] : [])),
		)
		const listed = removals.map(
			(group, position) =>
				`${group.change} ${records[position]?.attributes.find((attribute) => attribute.name === 'uuid')?.value}`,
		)
		expect(listed.sort()).toEqual(testCase.removals)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// With the IED's specification on no level of the unit's kind (the project moved it off its bay), there is nowhere to
// place what the revision gains: it is not placed, what the specification holds is updated where it sits.
describe('tx.lifecycle.apply - an S-IED update, its specification on no bay', () => {
	const testCases: SclTest.TestCases = {
		'BCU1’s functions directly under E1, the revision gaining Supervision, every group at its suggested action → Supervision placed nowhere, LineProtection updated under E1':
			{
				// BayControl (b…004) and LineProtection (b…005) sit under E1; the revision gains Supervision (a…007)
				sourceXml: isdTemplateSupervised,
				targetXml: projectNorthSpecificationOnNoBay,
				expectedQueries: [
					'//default:VoltageLevel[@name="E1"]/default:Function[@uuid="b0000000-0000-4000-8000-000000000005"]/default:LNode[@templateUuid="a0000000-0000-4000-8000-000000000015"][@iedName="BCU1"]',
				],
				unexpectedQueries: [
					'//default:Function[@templateUuid="a0000000-0000-4000-8000-000000000007"]',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		const groups = report.instances.flatMap((instance) => instance.groups)
		const decisions = new Map(groups.map((group) => [group.id, group.suggestedAction] as const))
		await target.transaction(async function applyUpdate(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// What waits for a decision is the removal taking the binding away, decided in its own group: the update of the
// function holding it does not wait with it.
describe('query.lifecycle.report - an S-IED update, an LNode of the project’s own bound to another IED', () => {
	const testCases: SclTest.TestCases<WaitingCase> = {
		'LineProtection holding an LNode of the project’s own bound to BCU2, the revision describing it → only that LNode’s removal waits for a decision':
			{
				// LineProtection (b…005) holds b…017, no lineage, specified on BCU1, bound to BCU2's CILO; the revision gives
				// the function a desc
				sourceXml: isdTemplateDescribingProtection,
				targetXml: projectNorthOwnLNodeOnBcu2,
				waiting: ['LNode target-only unbinds-another-ied'],
			},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<WaitingCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		const waiting = report.instances
			.flatMap((instance) => instance.groups)
			.filter((group) => group.requiresDecision)
			.map((group) => `${group.primary.tagName} ${group.change} ${group.requiresDecision}`)
		expect(waiting.sort()).toEqual(testCase.waiting)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** The update of BCU1 from a revision of its template ISD. */
async function updateOfBcu1(params: {
	project: SclTest.ActParams<SclTest.BaseXmlTestCase>['project']
	target: { query: Core.Query<Config> }
	sourceXml: string
}) {
	const { project, target, sourceXml } = params
	const imported = await project.importFile(
		new File([sourceXml], 'BCU_Template.isd', { type: 'text/xml' }),
	)
	const sourceQuery = project.openDocument(imported.documentId).query
	return {
		verb: 'ied',
		sourceQuery,
		ref: await iedNamed({ query: sourceQuery, name: 'SPECIFICATION' }),
		anchor: await projectRoot(target.query),
		scenario: 'template',
		targetInstance: await iedNamed({ query: target.query, name: 'BCU1' }),
	} as const
}

/** The IED of a document named so. */
async function iedNamed(params: {
	query: Core.Query<Config>
	name: string
}): Promise<Scl.Ref<'IED'>> {
	const [ied] = await params.query.findByAttributes({
		tagName: 'IED',
		attributes: { name: params.name },
	})
	if (!ied) throw new Error(`no IED ${params.name}`)
	return { tagName: 'IED', id: ied.id }
}

/** The root of the project. */
async function projectRoot(query: Core.Query<Config>): Promise<Scl.Ref<'SCL'>> {
	const root = await query.getRoot()
	return { tagName: 'SCL', id: root.id }
}
