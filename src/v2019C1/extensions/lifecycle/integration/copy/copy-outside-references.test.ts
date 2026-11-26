import { applyCopy, ref, reportCopy } from './copy-helpers'
import functionXml from './fixtures/a-function-to-copy.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { CopyCase } from './copy-helpers.types'
import type { Scl } from '@/v2019C1/config'
import type {
	DecisionMap,
	DiffReport,
	GroupDecision,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

// a-function-to-copy.xml: F1 (B1) holds the LNode ln1, whose SourceRef "Block" names F2's CSWI1 (ln2, in B2) and whose
// SourceRef "Trip" names P1's ExtRef (bound: cleared by the copy's unbind), and the breaker QA1, whose Terminal names B1's
// node L1 (n1). B3 holds nothing.

const F1_TO_B3: CopyCase = { verb: 'fsd', ref: ref('Function', 'f1'), anchor: ref('Bay', 'b3') }

/** The copy of F1's Block input under B3. */
const COPIED_BLOCK = '//default:Bay[@name="B3"]//v2019C1:SourceRef[@input="Block"]'
/** The copy of F1's breaker under B3. */
const COPIED_QA1 = '//default:Bay[@name="B3"]//default:ConductingEquipment[@name="QA1"]'

// A copy lists, per family, the references it carries out of what it copies: kept by default, each row saying what a
// skip does to it; a reference the copy's unbind clears, or one naming what it copies, is no row.
describe('fsd copy - the references leaving the copy, reported per family', () => {
	type ReportedCase = SclTest.BaseXmlTestCase & { copy: CopyCase; expected: string[] }

	const testCases: SclTest.TestCases<ReportedCase> = {
		// Block names F2's ln2 (B2), QA1's Terminal B1's L1; Trip names an ExtRef (unbound by the copy)
		'F1 to B3 → a source-signal group (Block, cleared) and a terminal-node group (QA1, deleted), kept, after nothing':
			{
				sourceXml: functionXml,
				copy: F1_TO_B3,
				expected: [
					'outside-references:source-signal accept, after nothing: block-input -> ln2 cleared',
					'outside-references:terminal-node accept, after nothing: qa1-terminal -> l1 deleted',
				],
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<ReportedCase>): Promise<void> {
		const groups = reportCopy({ document: source, copy: testCase.copy }).then(
			describeReferenceGroups,
		)
		await expect(groups).resolves.toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// The apply writes each family as decided: kept, the reference written as it is; skipped, a SourceRef kept with its link
// cleared and the expected data filled from what it named, a Terminal not written. The original is untouched.
describe('fsd copy - the references leaving the copy, written as decided', () => {
	type AppliedCase = SclTest.BaseXmlTestCase & {
		copy: CopyCase
		decide?: (report: DiffReport) => DecisionMap
	}

	const testCases: SclTest.TestCases<AppliedCase> = {
		"F1 to B3, both families accepted → the copy of Block names F2's CSWI1, the copy of QA1 names L1":
			{
				sourceXml: functionXml,
				copy: F1_TO_B3,
				decide: decideFamilies({ 'source-signal': 'accept', 'terminal-node': 'accept' }),
				expectedQueries: [
					`${COPIED_BLOCK}[@source="S1/VL1/B2/F2/CSWI1.Pos"][@sourceLNodeUuid="ln2"][@sourceDoName="Pos"]`,
					`${COPIED_QA1}/default:Terminal[@connectivityNode="S1/VL1/B1/L1"][@cNodeUuid="n1"]`,
				],
			},
		// no decision: every group at its suggestion, kept
		"F1 to B3, no decisions → the copy of Block names F2's CSWI1, the copy of QA1 names L1": {
			sourceXml: functionXml,
			copy: F1_TO_B3,
			expectedQueries: [
				`${COPIED_BLOCK}[@source="S1/VL1/B2/F2/CSWI1.Pos"][@sourceLNodeUuid="ln2"][@sourceDoName="Pos"]`,
				`${COPIED_QA1}/default:Terminal[@connectivityNode="S1/VL1/B1/L1"][@cNodeUuid="n1"]`,
			],
		},
		'F1 to B3, source-signal skipped → the copy of Block kept, its link cleared, pLN CSWI and pDO Pos filled':
			{
				sourceXml: functionXml,
				copy: F1_TO_B3,
				decide: decideFamilies({ 'source-signal': 'skip' }),
				expectedQueries: [
					`${COPIED_BLOCK}[@pLN="CSWI"][@pDO="Pos"][not(@pDA)][not(@source)][not(@sourceLNodeUuid)][not(@sourceDoName)]`,
					'//default:Bay[@name="B1"]//v2019C1:SourceRef[@input="Block"][@sourceLNodeUuid="ln2"][@source="S1/VL1/B2/F2/CSWI1.Pos"][@sourceDoName="Pos"][not(@pLN)][not(@pDO)]',
				],
			},
		'F1 to B3, terminal-node skipped → the copy of QA1 holds no Terminal; the original keeps its own':
			{
				sourceXml: functionXml,
				copy: F1_TO_B3,
				decide: decideFamilies({ 'terminal-node': 'skip' }),
				expectedQueries: [
					`${COPIED_QA1}[not(default:Terminal)]`,
					'//default:Bay[@name="B1"]//default:ConductingEquipment[@name="QA1"]/default:Terminal[@cNodeUuid="n1"]',
				],
			},
		'F1 to B3, terminal-node accepted alone → the copy of QA1 names L1': {
			sourceXml: functionXml,
			copy: F1_TO_B3,
			decide: decideFamilies({ 'terminal-node': 'accept' }),
			expectedQueries: [
				`${COPIED_QA1}/default:Terminal[@connectivityNode="S1/VL1/B1/L1"][@cNodeUuid="n1"]`,
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<AppliedCase>): Promise<SclTest.ActResult> {
		await expect(
			applyCopy({ document: source, copy: testCase.copy, decide: testCase.decide }),
		).resolves.toBe('committed')
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// Report == apply: each row of the report is written as its group was decided — kept, its link cleared, or not written,
// its parent copied whatever the decision — and nothing else the copy holds changes.
describe('fsd copy - the references leaving the copy, the apply as the report says', () => {
	type ParityCase = SclTest.BaseXmlTestCase & {
		copy: CopyCase
		families: Readonly<Record<string, 'accept' | 'skip'>>
		expected: string[]
		/** The tags the copy holds fewer of than the original: the holders not written. */
		lost: string[]
	}

	const testCases: SclTest.TestCases<ParityCase> = {
		'F1 to B3, both kept → each row written kept, the copy holds what F1 holds': {
			sourceXml: functionXml,
			copy: F1_TO_B3,
			families: { 'source-signal': 'accept', 'terminal-node': 'accept' },
			expected: ['block-input kept', 'qa1-terminal kept'],
			lost: [],
		},
		'F1 to B3, source-signal skipped → its row cleared, the other kept, the copy holds what F1 holds':
			{
				sourceXml: functionXml,
				copy: F1_TO_B3,
				families: { 'source-signal': 'skip', 'terminal-node': 'accept' },
				expected: ['block-input cleared', 'qa1-terminal kept'],
				lost: [],
			},
		'F1 to B3, both skipped → one row cleared, one not written, the copy holds what F1 holds but that Terminal':
			{
				sourceXml: functionXml,
				copy: F1_TO_B3,
				families: { 'source-signal': 'skip', 'terminal-node': 'skip' },
				expected: ['block-input cleared', 'qa1-terminal deleted'],
				lost: ['Terminal'],
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<ParityCase>): Promise<void> {
		const decide = decideFamilies(testCase.families)
		const { anchor } = testCase.copy
		const written = reportCopy({ document: source, copy: testCase.copy }).then(
			async function thenApply(report) {
				const applied = await applyCopy({ document: source, copy: testCase.copy, decide })
				const rows = report.instances
					.flatMap((instance) => instance.groups)
					.filter((group) => group.kind === 'references')
					.flatMap((group) =>
						(group.references ?? []).map((row) => ({
							row,
							skipped: testCase.families[group.id.replace('outside-references:', '')] === 'skip',
						})),
					)
				const states = await Promise.all(
					rows.map(async function stateOf({ row, skipped }) {
						const { copies, parentCopied } = await copiesUnder({
							document: source,
							anchor,
							holder: row.holder,
						})
						const linked = copies.some((copy) => holdsLink(copy))
						const state = copies.length === 0 ? 'deleted' : linked ? 'kept' : 'cleared'
						return {
							line: `${row.holder.id} ${state}`,
							asDecided: (skipped ? state === row.effect : state === 'kept') && parentCopied,
						}
					}),
				)
				const lost = await tagsLost({ document: source, anchor, original: F1_TO_B3.ref })
				return {
					applied,
					lines: states.map((state) => state.line).sort(),
					allAsDecided: states.every((state) => state.asDecided),
					lost,
				}
			},
		)
		await expect(written).resolves.toEqual({
			applied: 'committed',
			lines: testCase.expected,
			allAsDecided: true,
			lost: testCase.lost,
		})
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** The tags the copy of a function under the anchor holds fewer of than the function, one entry per element missing. */
async function tagsLost(params: {
	document: Scl.Document
	anchor: Scl.Ref<Scl.ElementsOf>
	original: Scl.Ref<Scl.ElementsOf>
}): Promise<string[]> {
	const { document, anchor, original } = params
	const [copied] = await document.query.any.getChildren(anchor, 'Function')
	const originalTree = await document.query.any.getTree(original)
	const copiedTree = copied ? await document.query.any.getTree(copied) : undefined
	const counts = new Map<string, number>()
	for (const tagName of tagsOf(originalTree)) counts.set(tagName, (counts.get(tagName) ?? 0) + 1)
	for (const tagName of tagsOf(copiedTree)) counts.set(tagName, (counts.get(tagName) ?? 0) - 1)
	return [...counts]
		.flatMap(([tagName, count]) => Array.from({ length: Math.max(count, 0) }, () => tagName))
		.sort()
}

/** The tag of every element of a tree, its root included. */
function tagsOf(tree: Core.AnyTreeRecord | undefined): string[] {
	return tree ? [tree.tagName, ...tree.tree.flatMap(tagsOf)] : []
}

/** The tags a reference leaving the copy is held by. */
const HOLDER_TAGS = ['SourceRef', 'ControlRef', 'FunctionRef', 'Terminal'] as const

/** The tags the holders of fixture A sit under. */
const PARENT_TAGS = ['LNodeInputs', 'ConductingEquipment'] as const

/**
 * A holder's copies under the anchor (the elements of its tag there sharing its `input` and its parent's name), and
 * whether its parent has a copy there (an element of the parent's tag and name).
 */
async function copiesUnder(params: {
	document: Scl.Document
	anchor: Scl.Ref<Scl.ElementsOf>
	holder: { tagName: string; id?: string }
}): Promise<{ copies: Core.AnyTrackedRecord[]; parentCopied: boolean }> {
	const { document, anchor, holder } = params
	const original = await document.query.any.getRecord(holder as Scl.Ref<Scl.ElementsOf>)
	if (!original?.parent) return { copies: [], parentCopied: false }
	const originalParent = await document.query.any.getRecord(
		original.parent as Scl.Ref<Scl.ElementsOf>,
	)
	const found = await document.query.findDescendants(anchor, {
		collect: [...HOLDER_TAGS, ...PARENT_TAGS],
	})
	const candidates: readonly Core.AnyTrackedRecord[] =
		found[holder.tagName as (typeof HOLDER_TAGS)[number]] ?? []
	const parentCandidates: readonly Core.AnyTrackedRecord[] =
		found[original.parent.tagName as (typeof PARENT_TAGS)[number]] ?? []
	const parentName = attributeOf(originalParent, 'name')
	const parentCopies = parentCandidates.filter(
		(candidate) => attributeOf(candidate, 'name') === parentName,
	)
	const parentIds = new Set(parentCopies.map((candidate) => candidate.id))
	const copies = candidates.filter(
		(candidate) =>
			parentIds.has(candidate.parent?.id ?? '') &&
			attributeOf(candidate, 'input') === attributeOf(original, 'input'),
	)
	return { copies, parentCopied: parentCopies.length > 0 }
}

/** Whether a holder still names a target by uuid (any `*Uuid` attribute of its pair other than its own). */
function holdsLink(record: Core.AnyTrackedRecord): boolean {
	return record.attributes.some(({ name }) => name !== 'uuid' && name.endsWith('Uuid'))
}

function attributeOf(record: Core.AnyTrackedRecord | undefined, name: string): string | undefined {
	return record?.attributes.find((attribute) => attribute.name === name)?.value
}

/** Each group of references the report lists, read for a person: id, suggestion, what it depends on, its rows. */
function describeReferenceGroups(report: DiffReport): string[] {
	return report.instances
		.flatMap((instance) => instance.groups)
		.filter((group) => group.kind === 'references')
		.map(function describeGroup(group) {
			const rows = (group.references ?? [])
				.map((row) => `${row.holder.id} -> ${row.target.id} ${row.effect}`)
				.join(', ')
			const after = group.dependsOn.length > 0 ? group.dependsOn.join(' ') : 'nothing'
			return `${group.id} ${group.suggestedAction}, after ${after}: ${rows}`
		})
		.sort()
}

/** The consumer's decision for groups of references, by family: every other group at its suggestion. */
function decideFamilies(
	families: Readonly<Record<string, GroupDecision>>,
): (report: DiffReport) => DecisionMap {
	return function decide() {
		return new Map(
			Object.entries(families).map(([family, decision]) => [
				`outside-references:${family}`,
				decision,
			]),
		)
	}
}
