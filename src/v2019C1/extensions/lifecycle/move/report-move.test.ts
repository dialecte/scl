import twoAccessPointsXml from './fixtures/an-ied-with-two-connected-access-points.xml?raw'
import twoBaysXml from './fixtures/two-bays-and-two-voltage-levels.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { MoveReport, ReportMoveParams } from './move.types'
import type { SclTest } from '@/v2019C1/test'

/** A report read for a person: the move, the name taken, the moved node and its group, as `describeReport` writes them. */
type DescribedReport = {
	move: string | undefined
	nameTaken: string | undefined
	node: string | undefined
	rootRef: string | undefined
	group: string | undefined
	/** The report's frame: the instance, its mappings, and the moved node's children. */
	shape: string | undefined
	moved: number
	needsDecisions: boolean
	refusals: string[]
	nothingToMove: boolean
}

type ReportCase = SclTest.BaseXmlTestCase & {
	move: ReportMoveParams
	expected: DescribedReport
}

// two-bays-and-two-voltage-levels.xml: S1/VL1/B1 holds C1 (naming F1), QA1 (on L1), L1, F1 (behaviour FB naming
// XCBR1, SF1/XCBR1, PTRC1, CSWI1);
// S1/VL1/B2 holds C1 (c2), QA2 (on L1), F2 (inputs from PTRC1 and XCBR1); S1/VL2/B3 holds F1 (f9) and F7
describe('tx.lifecycle.reportMove - a move reported for a merge review', () => {
	const testCases: SclTest.TestCases<ReportCase> = {
		// F1 carries FB and its variable, SF1, XCBR1, PTRC1, CSWI1 and the naming the import gave each LNode (its Private
		// wrapper is not counted); C1's reference and F2's two inputs name it by path
		'F1 to B2 → one moved node and its group, ten records carried, three references following': {
			sourceXml: twoBaysXml,
			move: { ref: ref('Function', 'f1'), parent: ref('Bay', 'b2') },
			expected: {
				move: 'Function f1 from Bay b1 to Bay b2: 10 records, 3 references follow',
				nameTaken: undefined,
				node: 'moved Function instance f1 source f1 applied f1 from b1 to b2',
				rootRef: 'f1',
				group: 'moved accept, name editable',
				shape: 'upToDate false, linked false, mappings 0, template instances 0, children 0',
				moved: 1,
				needsDecisions: false,
				refusals: [],
				nothingToMove: false,
			},
		},
		// B1 carries its Private, C1 and its reference, QA1 and its terminal, L1, F1 and what F1 holds; both terminals, C1's
		// reference and F2's inputs follow (L1's own path is no reference)
		'B1 to VL2 → sixteen records carried, five references following': {
			sourceXml: twoBaysXml,
			move: { ref: ref('Bay', 'b1'), parent: ref('VoltageLevel', 'vl2') },
			expected: {
				move: 'Bay b1 from VoltageLevel vl1 to VoltageLevel vl2: 16 records, 5 references follow',
				nameTaken: undefined,
				node: 'moved Bay instance b1 source b1 applied b1 from vl1 to vl2',
				rootRef: 'b1',
				group: 'moved accept, name editable',
				shape: 'upToDate false, linked false, mappings 0, template instances 0, children 0',
				moved: 1,
				needsDecisions: false,
				refusals: [],
				nothingToMove: false,
			},
		},
		// B3 holds a function F1 already: the engine numbers the name
		'F1 to B3, where a function F1 is → the name taken, F1_1 proposed, a decision needed': {
			sourceXml: twoBaysXml,
			move: { ref: ref('Function', 'f1'), parent: ref('Bay', 'b3') },
			expected: {
				move: 'Function f1 from Bay b1 to Bay b3: 10 records, 3 references follow',
				nameTaken: 'name F1 taken by Function f9 (uniqueChildNameInBay) → F1_1',
				node: 'moved Function instance f1 source f1 applied f1 from b1 to b3',
				rootRef: 'f1',
				group: 'moved accept, name editable',
				shape: 'upToDate false, linked false, mappings 0, template instances 0, children 0',
				moved: 1,
				needsDecisions: true,
				refusals: [],
				nothingToMove: false,
			},
		},
		// the Private of B2 holds a category C1: the categories of a bay are compared through its Private
		'C1 to the Private of B2, which holds a category C1 → the name taken at the bay, C1_1 proposed':
			{
				sourceXml: twoBaysXml,
				move: { ref: ref('FunctionCategory', 'c1'), parent: ref('Private', 'b2-private') },
				expected: {
					move: 'FunctionCategory c1 from Private b1-private to Private b2-private: 2 records, 0 references follow',
					nameTaken: 'name C1 taken by FunctionCategory c2 (uniqueChildNameInBay) → C1_1',
					node: 'moved FunctionCategory instance c1 source c1 applied c1 from b1-private to b2-private',
					rootRef: 'c1',
					group: 'moved accept, name editable',
					shape: 'upToDate false, linked false, mappings 0, template instances 0, children 0',
					moved: 1,
					needsDecisions: true,
					refusals: [],
					nothingToMove: false,
				},
			},
		// FB in F1 names XCBR1 of SF1: out of its reach once SF1 is in F2, it is cleared and does not count; F2's input
		// naming XCBR1 follows
		'SF1 to F2 → three records carried, one reference following, the one cleared not counted': {
			sourceXml: twoBaysXml,
			move: { ref: ref('SubFunction', 'sf1'), parent: ref('Function', 'f2') },
			expected: {
				move: 'SubFunction sf1 from Function f1 to Function f2: 3 records, 1 references follow',
				nameTaken: undefined,
				node: 'moved SubFunction instance sf1 source sf1 applied sf1 from f1 to f2',
				rootRef: 'sf1',
				group: 'moved accept, name editable',
				shape: 'upToDate false, linked false, mappings 0, template instances 0, children 0',
				moved: 1,
				needsDecisions: false,
				refusals: [],
				nothingToMove: false,
			},
		},
		// an-ied-with-two-connected-access-points.xml: CTRL (sending PositionGoose) goes from AP1 to AP2 of its IED, both
		// connected on N1: the address goes to AP2's connection as it is, the connections' children change, no reference
		// names anything else
		'CTRL to the server of AP2 → three records carried, no reference following: the address carried as it is':
			{
				sourceXml: twoAccessPointsXml,
				move: { ref: ref('LDevice', 'ctrl'), parent: ref('Server', 'a-server2') },
				expected: {
					move: 'LDevice ctrl from Server a-server1 to Server a-server2: 3 records, 0 references follow',
					nameTaken: undefined,
					node: 'moved LDevice instance ctrl source ctrl applied ctrl from a-server1 to a-server2',
					rootRef: 'ctrl',
					group: 'moved accept',
					shape: 'upToDate false, linked false, mappings 0, template instances 0, children 0',
					moved: 1,
					needsDecisions: false,
					refusals: [],
					nothingToMove: false,
				},
			},
		// F7 goes before F1 in B3: only the order of B3's children changes
		'F7 before F1 in B3 → a reorder: moved from B3 to B3, nothing follows': {
			sourceXml: twoBaysXml,
			move: { ref: ref('Function', 'f7'), parent: ref('Bay', 'b3'), before: ref('Function', 'f9') },
			expected: {
				move: 'Function f7 from Bay b3 to Bay b3: 1 records, 0 references follow, reordered',
				nameTaken: undefined,
				node: 'moved Function instance f7 source f7 applied f7 from b3 to b3',
				rootRef: 'f7',
				group: 'moved accept, name editable',
				shape: 'upToDate false, linked false, mappings 0, template instances 0, children 0',
				moved: 1,
				needsDecisions: false,
				refusals: [],
				nothingToMove: false,
			},
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<ReportCase>): Promise<void> {
		const described = reported({ source, move: testCase.move }).then(describeReport)
		await expect(described).resolves.toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// Core stages nothing when the element already sits where it is asked to go: nothing to report, nothing to decide.
describe('tx.lifecycle.reportMove - nothing to move', () => {
	const testCases: SclTest.TestCases<ReportCase> = {
		// F1 is the last child of B1
		'F1 to B1 with no sibling to go before, F1 already last → nothing to move, no node, no group': {
			sourceXml: twoBaysXml,
			move: { ref: ref('Function', 'f1'), parent: ref('Bay', 'b1') },
			expected: nothingToMove(),
		},
		// F1 (f9) sits right before F7 in B3
		'F1 before F7 in B3, where it already is → nothing to move': {
			sourceXml: twoBaysXml,
			move: { ref: ref('Function', 'f9'), parent: ref('Bay', 'b3'), before: ref('Function', 'f7') },
			expected: nothingToMove(),
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<ReportCase>): Promise<void> {
		const described = reported({ source, move: testCase.move }).then(describeReport)
		await expect(described).resolves.toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type Source = SclTest.ActParams<SclTest.BaseXmlTestCase>['source']

/** A ref of the fixture, by tag and id. */
function ref<GenericTag extends ReportMoveParams['ref']['tagName']>(
	tagName: GenericTag,
	id: string,
): ReportMoveParams['ref'] {
	return { tagName, id } as ReportMoveParams['ref']
}

/** The report of a move, in a transaction then discarded. */
async function reported(params: { source: Source; move: ReportMoveParams }): Promise<MoveReport> {
	const { source, move } = params
	let report: MoveReport | undefined
	let failure: unknown
	await source
		.prepare(async function reportThenDiscard(tx) {
			report = await tx.lifecycle.reportMove(move).catch(function kept(error: unknown) {
				failure = error
				return undefined
			})
		})
		.then(
			(prepared) => prepared.discard(),
			() => undefined,
		)
	if (failure) throw failure
	if (!report) throw new Error('no report')
	return report
}

/** What a report of nothing to move reads as. */
function nothingToMove(): DescribedReport {
	return {
		move: undefined,
		nameTaken: undefined,
		node: undefined,
		rootRef: undefined,
		group: undefined,
		shape: undefined,
		moved: 0,
		needsDecisions: false,
		refusals: [],
		nothingToMove: true,
	}
}

/** A report read for a person (see `DescribedReport`). */
function describeReport(report: MoveReport): DescribedReport {
	const { move } = report
	const [instance] = report.instances
	const node = instance?.tree
	const [group] = instance?.groups ?? []
	const editable = group?.editableAttributes?.some((attribute) => attribute.attr === 'name')
		? ', name editable'
		: ''
	const taken = move?.nameTaken
	return {
		move: move
			? `${move.element.tagName} ${move.element.id} from ${move.from.tagName} ${move.from.id} to ${move.to.tagName} ${move.to.id}: ${move.subtreeSize} records, ${move.followingReferences} references follow${move.reordered ? ', reordered' : ''}`
			: undefined,
		nameTaken: taken
			? `${taken.attribute} ${taken.value} taken by ${taken.collidesWith.tagName} ${taken.collidesWith.id} (${taken.constraint}) → ${taken.proposed}`
			: undefined,
		node: node
			? `${node.change} ${node.tagName} instance ${node.instanceRef?.id} source ${node.sourceRef?.id} applied ${node.appliedRef?.id} from ${node.movedFrom?.id} to ${node.movedTo?.id}`
			: undefined,
		rootRef: instance?.rootRef?.id,
		group: group ? `${group.change} ${group.suggestedAction}${editable}` : undefined,
		shape: instance
			? `upToDate ${instance.upToDate}, linked ${instance.linked}, mappings ${report.mappings.length + instance.mappings.length}, template instances ${report.templateInstances.length}, children ${instance.tree.children.length}`
			: undefined,
		moved: report.summary.moved,
		needsDecisions: report.needsDecisions,
		refusals: report.refusals.map((refusal) => `${refusal.key} ${refusal.code}`),
		nothingToMove: report.nothingToMove === true,
	}
}
