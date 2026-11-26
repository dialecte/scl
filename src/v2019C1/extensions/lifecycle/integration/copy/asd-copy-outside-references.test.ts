import { applyCopy, ref, reportCopy } from './copy-helpers'
import signallingXml from './fixtures/an-application-signalling-outside.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { CopyCase } from './copy-helpers.types'
import type {
	DecisionMap,
	DiffReport,
	GroupDecision,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

// an-application-signalling-outside.xml: B1 holds A7 composing F7 (its ROOT role also naming the EqFunction EQ8 of B2's
// breaker QB8, with a SignalRole) and A8 composing F7 and F9. F7's LNode lnf7: SourceRef "Block" naming F8's XCBR8 (ln8,
// B2) and ControlRef "Open" controlling it. F9's LNode lnf9: SourceRef "Block" naming ln8, SourceRef "Ready" naming lnf7.

const A7_TO_B3: CopyCase = {
	verb: 'asd',
	ref: ref('Application', 'a7'),
	anchor: ref('Bay', 'b3'),
}
const A8_TO_B3: CopyCase = {
	verb: 'asd',
	ref: ref('Application', 'a8'),
	anchor: ref('Bay', 'b3'),
}

/** A8's group placing the application: skipped with F7, which it depends on. */
function a8GroupOf(report: DiffReport): string {
	const group = report.instances
		.flatMap((instance) => instance.groups)
		.find((candidate) => candidate.primary.sourceRef?.id === 'a8')
	return group?.id ?? 'no-group-placing-a8'
}

/** A8's group placing F7, as its report lists it: skipped, F7 is not copied. */
function f7GroupOf(report: DiffReport): string {
	const group = report.instances
		.flatMap((instance) => instance.groups)
		.find((candidate) => candidate.primary.sourceRef?.id === 'f7')
	return group?.id ?? 'no-group-placing-f7'
}

// An application's copy lists the references its functions and roles carry out of it, per family, each group bound to no
// function: the signals F7 sends and receives, and the role naming an EqFunction it does not compose.
describe('asd copy - the references leaving the copy, reported per family', () => {
	type ReportedCase = SclTest.BaseXmlTestCase & { copy: CopyCase; expected: string[] }

	const testCases: SclTest.TestCases<ReportedCase> = {
		// F7's Block and Open name F8's ln8; A7's ROOT role names EQ8 beside F7
		'A7 to B3 → source-signal (Block, cleared), control-signal (Open, cleared), function-reference (EQ8, deleted)':
			{
				sourceXml: signallingXml,
				copy: A7_TO_B3,
				expected: [
					'outside-references:control-signal accept, after nothing: f7-open -> ln8 cleared',
					'outside-references:function-reference accept, after nothing: a7-eq8 -> eq8 deleted',
					'outside-references:source-signal accept, after nothing: f7-block -> ln8 cleared',
				],
			},
		// F9's Ready names F7's lnf7, which A8 copies: inside, no row; both Blocks name F8's ln8
		"A8 to B3 → source-signal rows F7's and F9's Block, control-signal F7's Open; F9's Ready no row":
			{
				sourceXml: signallingXml,
				copy: A8_TO_B3,
				expected: [
					'outside-references:control-signal accept, after nothing: f7-open -> ln8 cleared',
					'outside-references:source-signal accept, after nothing: f7-block -> ln8 cleared, f9-block -> ln8 cleared',
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

// The apply writes each family as decided, over the functions it places only; a function skipped asks nothing.
describe('asd copy - the references leaving the copy, written as decided', () => {
	type AppliedCase = SclTest.BaseXmlTestCase & {
		copy: CopyCase
		decide: (report: DiffReport) => DecisionMap
	}

	const testCases: SclTest.TestCases<AppliedCase> = {
		'A7 to B3, source-signal skipped, control-signal accepted → Block cleared with pLN XCBR, Open names ln8':
			{
				sourceXml: signallingXml,
				copy: A7_TO_B3,
				decide: decideFamilies({ 'source-signal': 'skip', 'control-signal': 'accept' }),
				expectedQueries: [
					'//default:Bay[@name="B3"]//v2019C1:SourceRef[@input="Block"][@pLN="XCBR"][@pDO="Pos"][not(@pDA)][not(@source)][not(@sourceLNodeUuid)][not(@sourceDoName)]',
					'//default:Bay[@name="B3"]//v2019C1:ControlRef[@output="Open"][@controlledLNodeUuid="ln8"][@controlled="S1/VL1/B2/F8/XCBR8.Pos"]',
				],
			},
		"A7 to B3, function-reference skipped → the copy of ROOT names F7's copy only, EQ8's FunctionRef and its SignalRole not written":
			{
				sourceXml: signallingXml,
				copy: A7_TO_B3,
				decide: decideFamilies({ 'function-reference': 'skip' }),
				expectedQueries: [
					'//default:Bay[@name="B3"]/default:Private/v2019C1:Application[@name="A7"]//v2019C1:FunctionRoleContent[count(v2019C1:FunctionRef)=1]/v2019C1:FunctionRef[@function="S1/VL1/B3/F7"]',
				],
				unexpectedQueries: [
					'//default:Bay[@name="B3"]//v2019C1:FunctionRef[@functionUuid="eq8"]',
					'//default:Bay[@name="B3"]//v2019C1:SignalRole',
				],
			},
		"A8 to B3, F7 skipped, source-signal skipped → F9's Block cleared, F9's Ready names the original F7, nothing refused":
			{
				sourceXml: signallingXml,
				copy: A8_TO_B3,
				decide: function decide(report) {
					return new Map([
						...decideFamilies({ 'source-signal': 'skip' })(report),
						[f7GroupOf(report), 'skip' as const],
						[a8GroupOf(report), 'skip' as const],
					])
				},
				expectedQueries: [
					'//default:Bay[@name="B3"]/default:Function[@name="F9"]//v2019C1:SourceRef[@input="Block"][@pLN="XCBR"][@pDO="Pos"][not(@pDA)][not(@source)][not(@sourceLNodeUuid)][not(@sourceDoName)]',
					'//default:Bay[@name="B3"]/default:Function[@name="F9"]//v2019C1:SourceRef[@input="Ready"][@sourceLNodeUuid="lnf7"][@source="S1/VL1/B1/F7/CSWI7.Pos"]',
				],
				unexpectedQueries: ['//default:Bay[@name="B3"]/default:Function[@name="F7"]'],
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
