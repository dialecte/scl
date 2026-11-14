import {
	assertAllowInvalidFixtureReason,
	assertOptOutReason,
	collectSclOutputViolations,
	describeSclOutputFailure,
	findAddedSclOutputViolations,
	findStaleTolerances,
	isTolerated,
	refusedUuidOf,
} from './assert-scl-output'
import { GIVEN_DOCUMENT_CHECKS, SCL_OUTPUT_CHECK } from './assert-scl-output.constants'

import { XmlAssertionError } from '@dialecte/core/test'

import type { SclOutputViolation } from './assert-scl-output.types'
import type { SclTest } from './hydrated-test.types'
import type {
	AssertGivenDocumentsParams,
	DescribeGivenDocumentFailureParams,
	DescribeStaleFixtureToleranceParams,
	RefusalOfParams,
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
 * Wrap a runner `act` so the documents it is given and the documents it leaves are checked. The violations of the
 * source and target documents are read before it runs; the given documents must pass the output checks first (see
 * {@link assertGivenDocuments}: the act does not run otherwise, a case's `allowInvalidFixture` tolerates what it lists,
 * `allowIncoherentReferences` leaves the references check out). Then every violation the act added fails the case, all
 * of them in one `XmlAssertionError` naming the case (see {@link assertOutputGate}). A case's `allowInvalidOutput`
 * tolerates the violations the act leaves that it lists, and only those: it never covers a given document. An act that
 * throws keeps its own error.
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
		const label = caseNames.get(testCase) ?? 'test case'

		const baseline = await readOutputBaseline({
			project,
			documents: documentsOf({ source, target }),
		})
		assertGivenDocuments({
			baseline,
			label,
			allowInvalidFixture: testCase.allowInvalidFixture,
			allowIncoherentReferences: testCase.allowIncoherentReferences,
		})
		const result = await act(actParams)
		await assertOutputGate({
			project,
			baseline,
			label,
			allowInvalidOutput: testCase.allowInvalidOutput,
		})
		return result
	}
}

/**
 * Refuse, before the suite runs, every case whose opt-out gives no reason or no violation, or whose
 * `allowInvalidFixture` tolerates the XSD validator or references (which `allowIncoherentReferences` covers). All of
 * them in one error.
 */
export function assertOutputGateTestCases(params: {
	testCases: Record<string, OutputGateTestCase>
}): void {
	const { testCases } = params
	const refusals = Object.entries(testCases).flatMap(([name, testCase]) => [
		...refusalOf({
			check: function checkAllowInvalidOutput() {
				assertOptOutReason({
					name: 'allowInvalidOutput',
					optOut: testCase.allowInvalidOutput,
					label: name,
				})
			},
		}),
		...refusalOf({
			check: function checkAllowInvalidFixture() {
				assertAllowInvalidFixtureReason({
					allowInvalidFixture: testCase.allowInvalidFixture,
					label: name,
				})
			},
		}),
	])
	if (refusals.length > 0) throw new Error(refusals.join('\n'))
}

/**
 * Throw, before the act, when a given document (the source or target as the case gave it) fails a check of the
 * output: schema, uniqueness, references and identity, read from the baseline (the XSD validator is not one of them;
 * references are left out when the case sets `allowIncoherentReferences`). One block per failing document, then the
 * case's stale tolerances: a tolerance of `allowInvalidFixture` no violation of the given documents matches. A plain
 * `Error`: the case's data is at fault, not the behaviour under test.
 *
 * @intent check the given documents of a test case before the act, fail a test whose fixture is not a valid SCL file
 */
export function assertGivenDocuments(params: AssertGivenDocumentsParams): void {
	const { baseline, label, allowInvalidFixture, allowIncoherentReferences } = params
	const checks = GIVEN_DOCUMENT_CHECKS.filter(
		(check) => !allowIncoherentReferences || check !== SCL_OUTPUT_CHECK.references,
	)
	const tolerances = allowInvalidFixture?.violations ?? []
	const held = baseline.documents.map((gated) => ({
		gated,
		violations: gated.before.filter((violation) => checks.includes(violation.check)),
	}))

	const documentFailures = held.flatMap(({ gated, violations }) => {
		const failing = violations.filter((violation) => !isTolerated({ tolerances, violation }))
		if (failing.length === 0) return []
		return [describeGivenDocumentFailure({ label, role: gated.role, failing })]
	})
	const stale = findStaleTolerances({
		tolerances,
		added: held.flatMap(({ violations }) => violations),
		ranChecks: checks,
	})
	const failures = [
		...documentFailures,
		...stale.map((tolerance) => describeStaleFixtureTolerance({ label, tolerance })),
	]
	if (failures.length > 0) throw new Error(failures.join('\n'))
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

/** The message of a given document that fails the checks: its header, then one line per violation. */
function describeGivenDocumentFailure(params: DescribeGivenDocumentFailureParams): string {
	const { label, role, failing } = params
	const header = `${label} › ${role}: the ${role} document has ${failing.length} violation(s) before the act: a given document must pass the output checks (give allowInvalidFixture with the violations and why):`
	return [header, ...failing.map((violation) => `  ${violation.description}`)].join('\n')
}

/** The message of a tolerance of `allowInvalidFixture` the given documents do not hold. */
function describeStaleFixtureTolerance(params: DescribeStaleFixtureToleranceParams): string {
	const { label, tolerance } = params
	const allowed = `${tolerance.check}${tolerance.code ? ` ${tolerance.code}` : ''}`
	return `${label}: [opt-out] allowInvalidFixture allows ${allowed}, which the given documents do not hold: remove it`
}

/** The message a check throws, as a list: empty when it passes. */
function refusalOf(params: RefusalOfParams): string[] {
	const { check } = params
	try {
		check()
		return []
	} catch (error) {
		return [error instanceof Error ? error.message : String(error)]
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
