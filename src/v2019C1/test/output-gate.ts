import {
	assertAllowInvalidOutputReason,
	collectSclOutputViolations,
	describeSclOutputFailure,
	findAddedSclOutputViolations,
	findStaleTolerances,
	isTolerated,
	refusedUuidOf,
} from './assert-scl-output'
import { SCL_OUTPUT_CHECK } from './assert-scl-output.constants'

import { XmlAssertionError } from '@dialecte/core/test'

import type { SclOutputViolation } from './assert-scl-output.types'
import type { SclTest } from './hydrated-test.types'
import type {
	AssertOutputGateParams,
	CloseGatedTestProjectParams,
	GatedDocument,
	GatedDocumentBaseline,
	GatedDocumentRead,
	OutputGateTestCase,
	ProjectOutputBaseline,
	ReadOutputBaselineParams,
	WithOutputGateParams,
} from './output-gate.types'

/**
 * Wrap a runner `act` so the documents it leaves are checked: the violations of the source and target documents
 * are read before it runs, and every violation it added fails the case, all of them in one `XmlAssertionError` naming
 * the case (see {@link assertOutputGate}). A case's `allowInvalidOutput` tolerates the violations it lists, and only
 * those. An act that throws keeps its own error.
 */
export function withOutputGate<GenericTestCase extends OutputGateTestCase, GenericResult>(
	params: WithOutputGateParams<GenericTestCase, GenericResult>,
): (actParams: SclTest.ActParams<GenericTestCase>) => Promise<GenericResult> {
	const { act, testCases } = params
	const caseNames = new Map(Object.entries(testCases).map(([name, testCase]) => [testCase, name]))

	return async function gatedAct(
		actParams: SclTest.ActParams<GenericTestCase>,
	): Promise<GenericResult> {
		const { testCase, project, source, target } = actParams

		const baseline = await readOutputBaseline({
			project,
			documents: documentsOf({ source, target }),
		})
		const result = await act(actParams)
		await assertOutputGate({
			project,
			baseline,
			label: caseNames.get(testCase) ?? 'test case',
			allowInvalidOutput: testCase.allowInvalidOutput,
		})
		return result
	}
}

/** Refuse, before the suite runs, every case whose opt-out gives no reason or no violation. All of them in one error. */
export function assertOutputGateTestCases(params: {
	testCases: Record<string, OutputGateTestCase>
}): void {
	const { testCases } = params
	const refusals = Object.entries(testCases).flatMap(([name, testCase]) => {
		try {
			assertAllowInvalidOutputReason({
				allowInvalidOutput: testCase.allowInvalidOutput,
				label: name,
			})
			return []
		} catch (error) {
			return [error instanceof Error ? error.message : String(error)]
		}
	})
	if (refusals.length > 0) throw new Error(refusals.join('\n'))
}

/** The violations of each document as it stands, the baseline the act is compared with. */
export async function readOutputBaseline(
	params: ReadOutputBaselineParams,
): Promise<ProjectOutputBaseline> {
	const { project, documents } = params
	const baselines: GatedDocumentBaseline[] = []
	for (const gated of documents) {
		const report = await collectSclOutputViolations({
			project,
			document: gated.document,
			asTestDocument: true,
		})
		baselines.push({ ...gated, before: report.violations })
	}
	return { documents: baselines }
}

/**
 * Throw once with every violation the documents gained since their baseline, each under its document. A violation
 * another document of the project held before the act (the fixture the act copied from, a template it imported) is
 * carried, not gained, as many times as it was held there. Every document is read as a test document (see
 * {@link collectSclOutputViolations}), and a value written as a uuid in a document of the project is a test uuid.
 * When the act added an untolerated violation the error is an `XmlAssertionError` (the case's stale tolerances stay
 * in its message); stale tolerances alone throw a plain `Error`.
 */
export async function assertOutputGate(params: AssertOutputGateParams): Promise<void> {
	const { project, baseline, label, allowInvalidOutput } = params
	const otherDocumentViolations = await readOtherDocumentViolations({ project, baseline })
	const read: GatedDocumentRead[] = []
	for (const gated of baseline.documents) {
		const report = await collectSclOutputViolations({
			project,
			document: gated.document,
			asTestDocument: true,
		})
		read.push({ gated, after: report.violations, checks: report.checks })
	}

	const tolerances = allowInvalidOutput?.violations ?? []
	const added = read.map(({ gated, after, checks }) => {
		const others = read.filter(
			(other) => other.gated.document.documentId !== gated.document.documentId,
		)
		// what the other documents held before the act: a copy of it is carried, not gained (each copy counted)
		const carried = [...others.flatMap((other) => other.gated.before), ...otherDocumentViolations]
		// the values written as uuids in the documents, the act's own writes to the other documents included
		const fixtureUuids = new Set(
			[gated.before, carried, others.flatMap((other) => other.after)]
				.flat()
				.flatMap((violation) =>
					violation.check === SCL_OUTPUT_CHECK.xsd ? (refusedUuidOf(violation.message) ?? []) : [],
				),
		)
		const gained = after.filter((violation) => !refusesFixtureUuid({ violation, fixtureUuids }))
		return {
			gated,
			checks,
			violations: findAddedSclOutputViolations({ before: gated.before, after: gained, carried }),
		}
	})

	// an opt-out is the case's: a tolerance is stale when no document of the case leaves what it allows
	const ranChecks = [...new Set(added.flatMap(({ checks }) => checks))]
	const stale = findStaleTolerances({
		tolerances,
		added: added.flatMap(({ violations }) => violations),
		ranChecks,
	})
	const addedFailures = added.flatMap(({ gated, checks, violations }) => {
		const failure = describeSclOutputFailure({
			label: `${label} › ${gated.role}`,
			failing: violations.filter((violation) => !isTolerated({ tolerances, violation })),
			stale: [],
			ranChecks: checks,
		})
		return failure ? [failure] : []
	})
	const failures = [
		...addedFailures,
		...(stale.length > 0
			? [describeSclOutputFailure({ label, failing: [], stale, ranChecks }) ?? '']
			: []),
	]
	if (failures.length === 0) return
	const message = failures.join('\n')
	// an added violation is the case's behaviour missing; stale tolerances alone are a defect of its opt-out
	if (addedFailures.length > 0) throw new XmlAssertionError(message)
	throw new Error(message)
}

/**
 * End a test project: check what its documents gained (unless the test failed already; a violation its opt-out lists
 * is tolerated, and a stale opt-out fails it), then destroy it whatever the check found.
 */
export async function closeGatedTestProject(params: CloseGatedTestProjectParams): Promise<void> {
	const { project, baseline, label, allowInvalidOutput, testFailed } = params
	try {
		if (!testFailed) await assertOutputGate({ project, baseline, label, allowInvalidOutput })
	} finally {
		await project.destroy()
	}
}

/** Whether the validator refuses, in a uuid attribute, a value a fixture writes as a uuid. */
function refusesFixtureUuid(params: {
	violation: SclOutputViolation
	fixtureUuids: ReadonlySet<string>
}): boolean {
	const { violation, fixtureUuids } = params
	if (violation.check !== SCL_OUTPUT_CHECK.xsd) return false
	const refused = refusedUuidOf(violation.message)
	return refused !== undefined && fixtureUuids.has(refused)
}

/** The violations of the documents of the project the gate does not check: what the act imported to read from. */
async function readOtherDocumentViolations(params: {
	project: AssertOutputGateParams['project']
	baseline: ProjectOutputBaseline
}): Promise<SclOutputViolation[]> {
	const { project, baseline } = params
	const gatedIds = new Set(baseline.documents.map(({ document }) => document.documentId))
	const others = (await project.getDocuments()).filter(({ id }) => !gatedIds.has(id))
	const violations: SclOutputViolation[] = []
	for (const { id } of others) {
		const document = project.openDocument(id)
		const report = await collectSclOutputViolations({ project, document, asTestDocument: true })
		violations.push(...report.violations)
	}
	return violations
}

function documentsOf(params: {
	source: GatedDocument['document']
	target?: GatedDocument['document']
}): GatedDocument[] {
	const { source, target } = params
	const documents: GatedDocument[] = [{ role: 'source', document: source }]
	if (target) documents.push({ role: 'target', document: target })
	return documents
}
