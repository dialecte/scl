import type {
	SclOutputBaseline,
	SclOutputCheck,
	SclOutputOptOut,
	SclOutputTolerance,
	SclOutputViolation,
} from './assert-scl-output.types'
import type { SclTest } from './hydrated-test.types'
import type * as CoreTest from '@dialecte/core/test'

/** A document of a test project, named by its role in the failure message. */
export type GatedDocument = {
	role: 'source' | 'target'
	document: SclTest.TestDocument['document']
}

/** A document and its violations as the project was opened, before the test wrote anything. */
export type GatedDocumentBaseline = GatedDocument & { before: SclOutputBaseline }

/** A gated document after the act: its baseline, what it holds now, and the checks that ran. */
export type GatedDocumentRead = {
	gated: GatedDocumentBaseline
	after: SclOutputViolation[]
	checks: readonly SclOutputCheck[]
}

/** The documents of a test project as it was opened. */
export type ProjectOutputBaseline = {
	documents: readonly GatedDocumentBaseline[]
}

export type ReadOutputBaselineParams = {
	project: SclTest.TestProjectResult['project']
	documents: readonly GatedDocument[]
}

export type AssertOutputGateParams = {
	project: SclTest.TestProjectResult['project']
	baseline: ProjectOutputBaseline
	/** Names the case in the failure message. */
	label: string
	/** The violations the case may leave, and why. */
	allowInvalidOutput?: SclOutputOptOut
}

export type AssertGivenDocumentsParams = {
	/** The violations of the given documents, read before the act. */
	baseline: ProjectOutputBaseline
	/** Names the case in the failure message. */
	label: string
	/** The violations the given documents may hold, and why. */
	allowInvalidFixture?: SclOutputOptOut
	/** Set when the given documents NEED an incoherent reference: the references check is left out. */
	allowIncoherentReferences?: string
}

export type CloseGatedTestProjectParams = AssertOutputGateParams & {
	/** The test failed already: its own error is the one to read, the check is skipped. */
	testFailed: boolean
}

/** A runner case as the gate reads it: the opt-outs and their reasons. */
export type OutputGateTestCase = CoreTest.BaseXmlTestCase & {
	allowInvalidOutput?: SclOutputOptOut
	/** The violations the case's given documents may hold before the act, and why. */
	allowInvalidFixture?: SclOutputOptOut
	/** The reason the case's given documents NEED an incoherent reference: the references family is left out. */
	allowIncoherentReferences?: string
	/** The reason a given document is a first-edition file on purpose, its root stating no SCL version. */
	editionOneRoot?: string
}

export type WithOutputGateParams<GenericTestCase extends OutputGateTestCase, GenericResult> = {
	act: (params: SclTest.ActParams<GenericTestCase>) => Promise<GenericResult>
	/** The cases the act runs for, by name: a failure names its case. */
	testCases: Record<string, GenericTestCase>
}

/** A given document that fails the checks: the case, its role, its violations. */
export type DescribeGivenDocumentFailureParams = {
	label: string
	role: GatedDocument['role']
	failing: readonly SclOutputViolation[]
}

/** A tolerance of `allowInvalidFixture` the given documents do not hold, and the case. */
export type DescribeStaleFixtureToleranceParams = {
	label: string
	tolerance: SclOutputTolerance
}

/** A check that throws its refusal. */
export type RefusalOfParams = { check: () => void }
