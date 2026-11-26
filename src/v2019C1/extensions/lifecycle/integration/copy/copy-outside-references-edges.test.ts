import { applyCopy, ref, reportCopy } from './copy-helpers'
import namingNothingXml from './fixtures/a-function-to-copy-naming-nothing.xml?raw'
import functionXml from './fixtures/a-function-to-copy.xml?raw'
import withTerminalXml from './fixtures/an-application-signalling-outside-with-a-terminal.xml?raw'
import signallingXml from './fixtures/an-application-signalling-outside.xml?raw'

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

// a-function-to-copy.xml: F1 (B1) holds the LNode ln1 bound to P1 and the breaker QA1 on B1's node L1.
// a-function-to-copy-naming-nothing.xml: the same, F1's Block input naming an LNode the document lacks (ln-gone).
// an-application-signalling-outside.xml: A7 composes F7, whose ControlRef "Open" controls F8's XCBR8 (ln8, in B2).
// an-application-signalling-outside-with-a-terminal.xml: the same, F7's breaker QA7 holding a Terminal on B2's node N8;
// A8 composes F7 and F9.

const F1_TO_B3: CopyCase = { verb: 'fsd', ref: ref('Function', 'f1'), anchor: ref('Bay', 'b3') }

// A reference naming nothing the document holds is no row: written as it is, whatever the families decided.
describe('copy - a reference naming nothing in the document', () => {
	type ReportedCase = SclTest.BaseXmlTestCase & { copy: CopyCase; expected: string[] }

	const testCases: SclTest.TestCases<ReportedCase> = {
		// Block names ln-gone; QA1's Terminal names L1
		'F1 to B3, its Block naming nothing → no source-signal group, the terminal-node group alone': {
			sourceXml: namingNothingXml,
			allowIncoherentReferences:
				'the Block input names an LNode the document lacks: what the copy writes as it is',
			copy: F1_TO_B3,
			expected: [
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

// The apply writes each family as decided; what no family groups, and what a root left out held, ask nothing.
describe('copy - the references leaving the copy, edge cases written as decided', () => {
	type AppliedCase = SclTest.BaseXmlTestCase & {
		copy: CopyCase
		decide: (report: DiffReport) => DecisionMap
	}

	const testCases: SclTest.TestCases<AppliedCase> = {
		'F1 to B3, its Block naming nothing, terminal-node skipped → Block written as it is, naming ln-gone':
			{
				sourceXml: namingNothingXml,
				allowIncoherentReferences:
					'the Block input names an LNode the document lacks: what the copy writes as it is',
				copy: F1_TO_B3,
				decide: decideFamilies({ 'terminal-node': 'skip' }),
				allowInvalidOutput: {
					reason:
						'the copy writes the Block input as it is, naming the LNode the document lacks: a second dangling reference',
					violations: [{ check: 'references', code: 'dangling' }],
				},
				expectedQueries: [
					'//default:Bay[@name="B3"]//v2019C1:SourceRef[@input="Block"][@sourceLNodeUuid="ln-gone"][@source="S1/VL1/B2/F2/CSWI9.Pos"][@sourceDoName="Pos"][not(@pLN)]',
				],
			},
		'A7 to B3, control-signal skipped → the copy of Open kept, its link cleared, pLN XCBR and pDO Pos, no pDA':
			{
				sourceXml: signallingXml,
				copy: { verb: 'asd', ref: ref('Application', 'a7'), anchor: ref('Bay', 'b3') },
				decide: decideFamilies({ 'control-signal': 'skip' }),
				expectedQueries: [
					'//default:Bay[@name="B3"]//v2019C1:ControlRef[@output="Open"][@pLN="XCBR"][@pDO="Pos"][not(@pDA)][not(@controlled)][not(@controlledLNodeUuid)][not(@controlledDoName)]',
					'//default:Bay[@name="B1"]//v2019C1:ControlRef[@output="Open"][@controlledLNodeUuid="ln8"][@controlled="S1/VL1/B2/F8/XCBR8.Pos"][@controlledDoName="Pos"][not(@pLN)]',
				],
			},
		// F7 is left out with A8, which depends on it; QA7's Terminal is a row of a root not placed
		'A8 to B3, F7 and A8 skipped, terminal-node skipped → F9 copied, no F7 and no Terminal under B3, nothing refused':
			{
				sourceXml: withTerminalXml,
				copy: { verb: 'asd', ref: ref('Application', 'a8'), anchor: ref('Bay', 'b3') },
				decide: function decide(report) {
					return new Map([
						...decideFamilies({ 'terminal-node': 'skip' })(report),
						[groupPlacing({ report, sourceId: 'f7' }), 'skip' as const],
						[groupPlacing({ report, sourceId: 'a8' }), 'skip' as const],
					])
				},
				expectedQueries: ['//default:Bay[@name="B3"]/default:Function[@name="F9"]'],
				unexpectedQueries: [
					'//default:Bay[@name="B3"]/default:Function[@name="F7"]',
					'//default:Bay[@name="B3"]//default:Terminal',
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

// A copy placed through the instantiate verb itself, with no report: still a copy, its LNodes released from their IED.
describe('copy - through instantiate.fsd itself', () => {
	type DirectCase = SclTest.BaseXmlTestCase & { copy: CopyCase }

	const testCases: SclTest.TestCases<DirectCase> = {
		// F1's ln1 is bound to P1's PTRC2
		'F1 copied to B3 by instantiate.fsd with scenario copy → the copy of ln1 bound to no IED, the original still bound':
			{
				sourceXml: functionXml,
				copy: F1_TO_B3,
				expectedQueries: [
					'//default:Bay[@name="B3"]//default:LNode[@lnClass="PTRC"][@iedName="None"][not(@lnUuid)]',
					'//default:Bay[@name="B1"]//default:LNode[@uuid="ln1"][@iedName="P1"][@lnUuid="p1-ptrc-uuid"]',
				],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<DirectCase>): Promise<SclTest.ActResult> {
		const placed = source
			.transaction(async function copyThroughInstantiate(tx) {
				await tx.lifecycle.instantiate.fsd({
					sourceQuery: source.query,
					functionRef: testCase.copy.ref as Scl.Ref<'Function'>,
					targetParent: testCase.copy.anchor,
					scenario: 'copy',
				})
			})
			.then(() => 'committed')
		await expect(placed).resolves.toBe('committed')
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The id of the group placing a source element, as its report lists it. */
function groupPlacing(params: { report: DiffReport; sourceId: string }): string {
	const group = params.report.instances
		.flatMap((instance) => instance.groups)
		.find((candidate) => candidate.primary.sourceRef?.id === params.sourceId)
	return group?.id ?? `no-group-placing-${params.sourceId}`
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
