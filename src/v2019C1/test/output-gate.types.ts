import type {
	SclOutputBaseline,
	SclOutputCheck,
	SclOutputOptOut,
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

export type CloseGatedTestProjectParams = AssertOutputGateParams & {
	/** The test failed already: its own error is the one to read, the check is skipped. */
	testFailed: boolean
}

/** A runner case as the gate reads it: the opt-out and its reason. */
export type OutputGateTestCase = CoreTest.BaseXmlTestCase & { allowInvalidOutput?: SclOutputOptOut }

export type WithOutputGateParams<GenericTestCase extends OutputGateTestCase, GenericResult> = {
	act: (params: SclTest.ActParams<GenericTestCase>) => Promise<GenericResult>
	/** The cases the act runs for, by name: a failure names its case. */
	testCases: Record<string, GenericTestCase>
}
