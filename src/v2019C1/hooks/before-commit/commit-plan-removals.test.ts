import logicalNodeWithOwnTypeXml from '../../extensions/clean-up/transaction/fixtures/commit-prune-a-logical-node-with-its-own-type.xml?raw'
import { planCommit } from './before-commit'
import categoryAndVariableXml from './fixtures/a-category-and-a-variable-named-by-an-application.xml?raw'
import aFunctionWithAResourceXml from './fixtures/a-function-with-a-resource-and-a-behaviour.xml?raw'
import serverWithOneLogicalDeviceXml from './fixtures/commit-plan-a-server-with-one-logical-device.xml?raw'
import twoGooseDataSetsXml from './fixtures/commit-plan-two-goose-data-sets-of-one-entry.xml?raw'
import lnodesBoundToADeviceXml from './fixtures/lnodes-bound-to-a-device.xml?raw'
import twoSubstationsAndALineXml from './fixtures/two-substations-and-a-line.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { PlannedCommit } from './commit-plan.types'
import type { LNodeBinding } from './release-deleted-logical-nodes.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type PlanCase = SclTest.BaseXmlTestCase & {
	/** What the transaction writes before the commit is planned. */
	write: (tx: Scl.Transaction) => Promise<void>
	/** What the plan reports, as the case's own describe writes it. */
	containers: string[]
}

type PlanParams = Pick<PlanCase, 'write'> & { source: SclTest.ActParams<PlanCase>['source'] }

/** The plan of the commit after `write`; the transaction discarded. */
async function plannedAfter(params: PlanParams): Promise<PlannedCommit> {
	let planned: PlannedCommit | undefined
	const prepared = await params.source.prepare(async function writeThenPlan(tx) {
		await params.write(tx)
		planned = await planCommit({ operations: tx.getStagedOperations(), query: tx })
	})
	prepared.discard()
	if (!planned) throw new Error('no plan')
	return planned
}

/** A transaction deleting each element in turn. */
function deleting(
	refs: readonly Scl.Ref<Scl.ElementsOf>[],
): (tx: Scl.Transaction) => Promise<void> {
	return async function deleteEach(tx) {
		for (const ref of refs) await tx.delete(ref)
	}
}

// A container the commit prunes takes with it what names it outside itself: those records are named on its `goesWith`,
// each with the identity that names it for a person, under the container that caused it to go.
describe('planCommit - what a pruned container takes outside itself', () => {
	const testCases: SclTest.TestCases<PlanCase> = {
		// C1 and V1 hold only what named F1: both are emptied, and the application's references to them go with them
		'the function the category and the variable name deleted → each lists the reference naming it from the application':
			{
				sourceXml: categoryAndVariableXml,
				write: deleting([{ tagName: 'Function', id: 'f1' }]),
				containers: [
					'FunctionCategory c1: FunctionCategoryRef cat-named - - deleted',
					'Variable v1: VariableRef var-named - - deleted',
				],
			},
		// GC1 sends DS1 and nothing else: the block it clears and revises is named with its own identity
		'the only entry of DS1 deleted → DS1 names the control block it clears and revises': {
			sourceXml: twoGooseDataSetsXml,
			write: deleting([{ tagName: 'FCDA', id: 'ds1-entry' }]),
			containers: ['DataSet ds1: GSEControl gc1 GC1 - cleared, GSEControl gc1 GC1 - revised'],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<PlanCase>): Promise<void> {
		await expect(goesWithIdentified({ source, write: testCase.write })).resolves.toEqual(
			testCase.containers,
		)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** `<tag> <id> <name>: <tag> <id> <name> - <effect>, ...` of each container the plan lists after `write`. */
async function goesWithIdentified(params: PlanParams): Promise<string[]> {
	return (await plannedAfter(params)).containers.map(function describeOutside(container) {
		const outside = container.goesWith.map(
			(effect) =>
				`${effect.element.tagName} ${effect.element.id} ${nameOf(effect.identity)} - ${effect.effect}`,
		)
		return `${container.element.tagName} ${container.element.id}: ${outside.join(', ') || 'nothing'}`
	})
}

/** What names an element for a person: its name, else its uuid, else a dash. */
function nameOf(identity: { name?: string; uuid?: string }): string {
	return identity.name ?? identity.uuid ?? '-'
}

// What the moves of a commit remove, beside the paths and names they write: a reference its new place cannot reach
// (kept with those names cleared, or deleted), and a terminal naming a node its container may not name. A record a
// removed element holds goes with it and is not listed on its own.
describe('planCommit - what the moves of a commit remove', () => {
	const testCases: SclTest.TestCases<PlanCase> = {
		// F2 holds no process resource and no behaviour: PTRC1's source loses PR1, the behaviour input of F1 loses
		// PTRC1, and the subscriber naming PR1 holds nothing of its own. The DOS above the subscriber only loses a
		// child: it is no removal.
		'PTRC1 moved to F2 → its source and the behaviour input cleared, the subscriber deleted': {
			sourceXml: aFunctionWithAResourceXml,
			write: movingTo({ tagName: 'LNode', id: 'ptrc1' }, { tagName: 'Function', id: 'f2' }),
			containers: [
				'out-of-reach cleared InputVar in1',
				'out-of-reach cleared SourceRef source-ref',
				'out-of-reach deleted SubscriberLNode subscriber',
			],
		},
		// QA1 leaves S1 for S2; its terminal names L1, which stays in S1, and the vendor data the terminal holds goes
		// with it rather than on its own
		'QA1 moved from S1 to S2 → its terminal naming L1 removed, the data it holds not listed on its own':
			{
				sourceXml: twoSubstationsAndALineXml,
				write: movingTo(
					{ tagName: 'ConductingEquipment', id: 'qa1' },
					{ tagName: 'Bay', id: 'b5' },
				),
				containers: ['terminal-across-containers deleted Terminal t-inner'],
			},
		// nothing moves: no reference leaves its reach, no terminal is stranded
		'a function deleted → the moves remove nothing': {
			sourceXml: categoryAndVariableXml,
			write: deleting([{ tagName: 'Function', id: 'f1' }]),
			containers: [],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<PlanCase>): Promise<void> {
		await expect(moveRemovalsPlanned({ source, write: testCase.write })).resolves.toEqual(
			testCase.containers,
		)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** `<reason> <effect> <tag> <id>` of each element the moves of the commit remove, sorted. */
async function moveRemovalsPlanned(params: PlanParams): Promise<string[]> {
	return (await plannedAfter(params)).moveRemovals
		.map(
			(removal) =>
				`${removal.reason} ${removal.effect} ${removal.element.tagName} ${removal.element.id}`,
		)
		.sort()
}

// An LNode bound to a logical node the transaction deletes is released at the commit: the plan names it with the
// binding it had and the one it is left with, so a caller can say which LNodes the commit unbound.
describe('planCommit - the LNodes the commit releases', () => {
	const testCases: SclTest.TestCases<PlanCase> = {
		// the breaker LNode is bound to P1's Q0XCBR2 and specified on S_IED's XCBR1, which the document still holds
		"P1's breaker deleted → the LNode bound to it released back to its specification": {
			sourceXml: lnodesBoundToADeviceXml,
			write: deleting([{ tagName: 'LN', id: 'p1-breaker' }]),
			containers: [
				'LNode breaker breaker-uuid: P1/LD0/Q0/XCBR/2 p1-breaker-uuid → S_IED/LD0//XCBR/1 s-breaker-uuid',
			],
		},
		// no logical node goes: no LNode is released
		'a function deleted → no LNode released': {
			sourceXml: categoryAndVariableXml,
			write: deleting([{ tagName: 'Function', id: 'f1' }]),
			containers: [],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<PlanCase>): Promise<void> {
		await expect(releasedPlanned({ source, write: testCase.write })).resolves.toEqual(
			testCase.containers,
		)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** `<tag> <id> <uuid>: <binding before> → <binding after>` of each LNode the commit releases. */
async function releasedPlanned(params: PlanParams): Promise<string[]> {
	return (await plannedAfter(params)).released.map(function describeRelease(release) {
		return `${release.element.tagName} ${release.element.id} ${release.identity.uuid ?? '-'}: ${addressOf(release.from)} → ${addressOf(release.to)}`
	})
}

/** `<iedName>/<ldInst>/<prefix>/<lnClass>/<lnInst> <lnUuid>` of a binding, an absent part left empty. */
function addressOf(binding: LNodeBinding): string {
	const parts = [binding.iedName, binding.ldInst, binding.prefix, binding.lnClass, binding.lnInst]
	return `${parts.map((part) => part ?? '').join('/')} ${binding.lnUuid ?? '-'}`
}

/** A transaction moving an element under a parent. */
function movingTo(
	element: Scl.Ref<Scl.ElementsOf>,
	parent: Scl.Ref<Scl.ElementsOf>,
): PlanCase['write'] {
	return async function move(tx: Scl.Transaction): Promise<void> {
		await tx.any.move(element, { parent })
	}
}

// The commit's prune never stages a record twice: a DataTypeTemplates emptied by the type prune takes none of the types
// the type prune already deletes.
describe('planCommit - each record deleted once', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// IED1 is the only IED: its deletion leaves every type unused and the DataTypeTemplates empty
		'the only IED deleted → every record the plan deletes, deleted once': {
			sourceXml: logicalNodeWithOwnTypeXml,
		},
	}

	async function act({ source }: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<void> {
		await expect(deletedTwice({ source })).resolves.toEqual([])
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** The ids the plan deletes more than once after the only IED is deleted. */
async function deletedTwice(params: { source: PlanParams['source'] }): Promise<string[]> {
	const planned = await plannedAfter({
		...params,
		write: deleting([{ tagName: 'IED', id: 'ied1' }]),
	})
	const ids = planned.staged.flatMap((operation) =>
		operation.status === 'deleted' ? [operation.oldRecord.id] : [],
	)
	return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].sort()
}

// The containers are pruned before the types, so the type prune reads what their cascade left. What a pruned container
// takes with it - the records it still holds, a tool's data among them - names no data type, so it never makes a type
// unused on its own: a type a logical node outside the prune still names stays.
describe('planCommit - a pruned container never makes a type unused by itself', () => {
	const testCases: SclTest.TestCases<PlanCase> = {
		// IED2's logical device deleted: its Server is pruned and takes its Authentication, while IED1's LLN0 keeps
		// naming LLN0_T, so the type prune stages nothing
		"the last logical device of IED2's server deleted → the Server pruned, every type kept": {
			sourceXml: serverWithOneLogicalDeviceXml,
			write: deleting([{ tagName: 'LDevice', id: 'ied2-ld' }]),
			containers: [
				'emptiedContainers deleted Server ied2-server',
				'emptiedContainers deleted Authentication ied2-authentication',
			],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<PlanCase>): Promise<void> {
		const planned = await plannedAfter({ source, write: testCase.write })
		expect(planned.stagedBy.get('unusedTypes') ?? []).toEqual([])
		expect(
			[...(planned.stagedBy.get('emptiedContainers') ?? [])].flatMap((operation) =>
				operation.status === 'deleted'
					? [`emptiedContainers deleted ${operation.oldRecord.tagName} ${operation.oldRecord.id}`]
					: [],
			),
		).toEqual(testCase.containers)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
