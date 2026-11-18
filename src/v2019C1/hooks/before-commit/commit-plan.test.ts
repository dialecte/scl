import { planCommit } from './before-commit'
import { COMMIT_STEPS } from './commit-steps.constants'
import relationInWrapperXml from './fixtures/commit-plan-a-relation-in-a-namespace-wrapper.xml?raw'
import serverWithOneLogicalDeviceXml from './fixtures/commit-plan-a-server-with-one-logical-device.xml?raw'
import inputNamingANewLogicalNodeXml from './fixtures/commit-plan-an-input-naming-a-logical-node-to-create.xml?raw'
import lnodeNamingALogicalNodeToCreateXml from './fixtures/commit-plan-an-lnode-naming-a-logical-node-to-create.xml?raw'
import oneSubNetworkWithBitRateXml from './fixtures/commit-plan-one-subnetwork-with-its-bit-rate.xml?raw'
import twoGooseDataSetsXml from './fixtures/commit-plan-two-goose-data-sets-of-one-entry.xml?raw'
import twoSubNetworksXml from './fixtures/commit-plan-two-subnetworks-one-with-one-access-point.xml?raw'

import { describe, expect, it } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { PrunedContainer } from './prune-emptied-containers.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type PlanCase = SclTest.BaseXmlTestCase & {
	/** What the transaction writes before the commit is planned. */
	write: (tx: Scl.Transaction) => Promise<void>
	/** Each container the commit's prune removes, as `describeContainer` writes it, in the order the prune finds them. */
	containers: string[]
}

// The commit's steps run in one order, each reading what every step before it wrote, but the type prune, which reads
// the transaction's operations only.
describe('planCommit - the commit runs its steps in one order', () => {
	it('lists its steps in the order they run, each reading every step before it but the type prune', () => {
		expect(COMMIT_STEPS.map((step) => `${step.name} ${step.readsEarlier}`)).toEqual([
			'lnodeNamings true',
			'tupleNames true',
			'tupleReferences true',
			'pathReferences true',
			'releasedLNodes true',
			'unusedTypes false',
			'emptiedContainers true',
			'noChildLeftBehind true',
		])
	})
})

// Each container the commit's prune removes is listed with why it goes and what it still holds (`within`).
describe('planCommit - the containers the prune removes, each with why it goes and what it holds', () => {
	const testCases: SclTest.TestCases<PlanCase> = {
		'the last logical device of a server deleted, its Authentication left → the Server emptied, its Authentication within':
			{
				sourceXml: serverWithOneLogicalDeviceXml,
				write: deleting([{ tagName: 'LDevice', id: 'ied1-ld' }]),
				containers: [
					'Server ied1-server in AccessPoint ied1-ap: emptied lost-required LDevice; within Authentication ied1-authentication',
				],
			},
		'the only connected access point of Bus_A deleted → the SubNetwork emptied': {
			sourceXml: twoSubNetworksXml,
			write: deleting([{ tagName: 'ConnectedAP', id: 'bus-a-ied1' }]),
			containers: [
				'SubNetwork bus-a in Communication communication: emptied holds-nothing; within nothing',
			],
		},
		'the only connected access point of Bus_A moved to Bus_B → Bus_A emptied': {
			sourceXml: twoSubNetworksXml,
			write: movingTheConnectionOfIed1ToBusB,
			containers: [
				'SubNetwork bus-a in Communication communication: emptied holds-nothing; within nothing',
			],
		},
		// Bus_A keeps its BitRate, which goes with it, not with the Communication above it
		'the only connected access point of the only SubNetwork deleted → Bus_A emptied holding its BitRate, the Communication above it':
			{
				sourceXml: oneSubNetworkWithBitRateXml,
				write: deleting([{ tagName: 'ConnectedAP', id: 'bus-a-ied1' }]),
				containers: [
					'SubNetwork bus-a in Communication communication: emptied lost-required ConnectedAP; within BitRate bus-a-bit-rate',
					'Communication communication in SCL project: above SubNetwork bus-a; within nothing',
				],
			},
		'the only relation of a list in a namespace wrapper deleted → the list emptied, the wrapper above it':
			{
				sourceXml: relationInWrapperXml,
				write: deleting([{ tagName: 'PowerSystemRelation', id: 'psr1' }]),
				containers: [
					'PowerSystemRelations relations in Private f1-private: emptied holds-nothing; within nothing',
					'Private f1-private in Function f1: above PowerSystemRelations relations; within nothing',
				],
			},
		"the LLN0 of IED2's logical device deleted → the logical device stays, an element of its own, no container":
			{
				sourceXml: serverWithOneLogicalDeviceXml,
				write: deleting([{ tagName: 'LN0', id: 'ied2-lln0' }]),
				containers: [],
			},
		'the only entry of DS1 deleted → DS1 emptied': {
			sourceXml: twoGooseDataSetsXml,
			write: deleting([{ tagName: 'FCDA', id: 'ds1-entry' }]),
			containers: ['DataSet ds1 in LN0 ied1-lln0: emptied holds-nothing; within nothing'],
		},
		'the only entries of DS1 and DS2 deleted in one transaction → both data sets emptied': {
			sourceXml: twoGooseDataSetsXml,
			write: deleting([
				{ tagName: 'FCDA', id: 'ds1-entry' },
				{ tagName: 'FCDA', id: 'ds2-entry' },
			]),
			containers: [
				'DataSet ds1 in LN0 ied1-lln0: emptied holds-nothing; within nothing',
				'DataSet ds2 in LN0 ied1-lln0: emptied holds-nothing; within nothing',
			],
		},
		// the prune reads the names the commit writes on ext-b too: ext-b stays in the inputs ext-a leaves, so they stay
		'ext-a deleted and the logical node ext-b names by uuid created → the inputs stay, no container':
			{
				sourceXml: inputNamingANewLogicalNodeXml,
				write: deletingAndCreatingTheNamedLogicalNode,
				containers: [],
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<PlanCase>): Promise<void> {
		await expect(containersPlanned({ source, write: testCase.write })).resolves.toEqual(
			testCase.containers,
		)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// The plan stages what the commit stages: the names written on ext-b among them.
describe('planCommit - stages what the commit stages', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'ext-a deleted and the logical node ext-b names created → the commit writes the names the plan staged on ext-b':
			{
				sourceXml: inputNamingANewLogicalNodeXml,
				expectedQueries: [
					'//default:ExtRef[@intAddr="Pos"][@lnUuid="new-ln-uuid"][@iedName="P2"][@ldInst="LD0"][@lnClass="XCBR"]',
				],
				unexpectedQueries: ['//default:ExtRef[@intAddr="Beh"]'],
			},
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await expect(planNamesExtBThenCommit({ source })).resolves.toBe(true)
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// The prune builds the update of an element losing a pruned child from what every step before it wrote. An LNode that
// names by uuid a logical node the transaction creates, and whose wrapper the transaction empties, is unbound in a
// valid document (bound, its names would name a logical node that does not exist), and the commit writes no names on
// an unbound LNode: its wrapper goes, its names stay as written.
describe('planCommit - the prune of an LNode wrapper keeps the LNode as written', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// the unbound trip names new-ln by uuid only; its wrapper holds only its naming, deleted while new-ln is created
		'the logical node the unbound trip names created and its only naming deleted → its wrapper gone, the trip unbound as written':
			{
				sourceXml: lnodeNamingALogicalNodeToCreateXml,
				expectedQueries: [
					'//default:LNode[@uuid="lnode-trip"][@iedName="None"][@lnClass="PTRC"][@lnInst="1"][@lnUuid="new-ln"]',
				],
				unexpectedQueries: ['//default:LNode[@uuid="lnode-trip"]/default:Private'],
			},
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function createTheLogicalNodeAndDeleteTheNaming(tx) {
			await tx.addChild(
				{ tagName: 'LDevice', id: 'ied1-ld' },
				{
					tagName: 'LN',
					attributes: { lnClass: 'PTRC', inst: '7', lnType: 'PTRC_T', uuid: 'new-ln' },
				},
			)
			await tx.delete({ tagName: 'LNodeSpecNaming', id: 'trip-naming' })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// What the plan stages is what the commit stages: the operations the commit adds after the transaction's own, in order.
describe('planCommit - the plan stages what the commit stages, in order', () => {
	const testCases: SclTest.TestCases<PlanCase> = {
		// DS1 emptied: the commit removes it and clears its sender's data set, raising its revision
		'the only entry of DS1 deleted → the plan stages what the commit adds after the transaction, in order':
			{
				sourceXml: twoGooseDataSetsXml,
				write: deleting([{ tagName: 'FCDA', id: 'ds1-entry' }]),
				containers: ['DataSet ds1 in LN0 ied1-lln0: emptied holds-nothing; within nothing'],
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<PlanCase>): Promise<void> {
		const { planned, committed, containers } = await stagedByPlanAndCommit({
			source,
			write: testCase.write,
		})
		expect(containers).toEqual(testCase.containers)
		expect(planned).toEqual(committed)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** What the plan stages after `write`, and what the commit adds after the transaction's own operations, described. */
async function stagedByPlanAndCommit(params: {
	source: SclTest.ActParams<PlanCase>['source']
	write: (tx: Scl.Transaction) => Promise<void>
}): Promise<{ planned: string[]; committed: string[]; containers: string[] }> {
	const { source, write } = params
	let own = 0
	let planned: string[] = []
	let containers: string[] = []
	const prepared = await source.prepare(async function writeThenPlan(tx) {
		await write(tx)
		own = tx.getStagedOperations().length
		const plan = await planCommit({ operations: tx.getStagedOperations(), query: tx })
		planned = plan.staged.map(describeOperation)
		containers = plan.containers.map(describeContainer)
	})
	const committed = prepared.operations.slice(own).map(describeOperation)
	prepared.discard()
	return { planned, committed, containers }
}

/** `<status> <tag> <id> <attributes>`, the attributes of the record it leaves. */
function describeOperation(operation: Scl.Operation): string {
	const record = operation.status === 'deleted' ? operation.oldRecord : operation.newRecord
	const attributes = record.attributes
		.map((attribute) => `${attribute.name}=${attribute.value}`)
		.join(' ')
	return `${operation.status} ${record.tagName} ${record.id} ${attributes}`
}

/** The containers the plan of the commit lists after `write`, described; the transaction discarded. */
async function containersPlanned(params: {
	source: SclTest.ActParams<PlanCase>['source']
	write: (tx: Scl.Transaction) => Promise<void>
}): Promise<string[]> {
	const { source, write } = params
	let containers: PrunedContainer[] = []
	const prepared = await source.prepare(async function writeThenPlan(tx) {
		await write(tx)
		const planned = await planCommit({ operations: tx.getStagedOperations(), query: tx })
		containers = planned.containers
	})
	prepared.discard()
	return containers.map(describeContainer)
}

/** Whether the plan stages the names written on ext-b; the transaction then committed. */
async function planNamesExtBThenCommit(params: {
	source: SclTest.ActParams<SclTest.BaseXmlTestCase>['source']
}): Promise<boolean> {
	let namedInPlan = false
	const prepared = await params.source.prepare(async function writeThenPlan(tx) {
		await deletingAndCreatingTheNamedLogicalNode(tx)
		const planned = await planCommit({ operations: tx.getStagedOperations(), query: tx })
		namedInPlan = planned.staged.some(
			(operation) => operation.status === 'updated' && operation.newRecord.id === 'ext-b',
		)
	})
	await prepared.commit()
	return namedInPlan
}

/** IED1's connected access point moved from Bus_A to Bus_B. */
async function movingTheConnectionOfIed1ToBusB(tx: Scl.Transaction): Promise<void> {
	await tx.move(
		{ tagName: 'ConnectedAP', id: 'bus-a-ied1' },
		{ parent: { tagName: 'SubNetwork', id: 'bus-b' } },
	)
}

/** A write deleting each element, in order. */
function deleting(
	refs: readonly Scl.Ref<Scl.ElementsOf>[],
): (tx: Scl.Transaction) => Promise<void> {
	return async function deleteEach(tx) {
		for (const ref of refs) await tx.delete(ref)
	}
}

/** ext-a deleted; P2's LD0 given the logical node `new-ln-uuid` that ext-b names by uuid only. */
async function deletingAndCreatingTheNamedLogicalNode(tx: Scl.Transaction): Promise<void> {
	await tx.delete({ tagName: 'ExtRef', id: 'ext-a' })
	await tx.addChild(
		{ tagName: 'LDevice', id: 'p2-ld' },
		{
			tagName: 'LN',
			attributes: { lnClass: 'XCBR', inst: '1', lnType: 'XCBR_T', uuid: 'new-ln-uuid' },
		},
	)
}

/** `<tag> <id> in <parent tag> <parent id>: <reason>; within <records>`. */
function describeContainer(container: PrunedContainer): string {
	const { element, parent, reason, within } = container
	const why =
		reason.kind === 'above'
			? `above ${reason.below.tagName} ${reason.below.id}`
			: reason.rule === 'holds-nothing'
				? 'emptied holds-nothing'
				: `emptied lost-required ${reason.group.join(' ')}`
	const held =
		within.length === 0
			? 'nothing'
			: within.map((record) => `${record.tagName} ${record.id}`).join(', ')
	return `${element.tagName} ${element.id} in ${parent.tagName} ${parent.id}: ${why}; within ${held}`
}
