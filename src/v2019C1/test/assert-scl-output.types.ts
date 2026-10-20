import type { SCL_OUTPUT_CHECK, SCL_XSD_CODE } from './assert-scl-output.constants'
import type { SclTest } from './hydrated-test.types'

export type SclOutputCheck = (typeof SCL_OUTPUT_CHECK)[keyof typeof SCL_OUTPUT_CHECK]

/**
 * One thing a real file could not hold, found on a document. `description` is one line, `[check] <element> what`;
 * `key` is what the violation is compared by before and after an act: no record id, no position, and for the
 * validator no list of what it expected there (that list changes with the siblings, the violation does not).
 */
export type SclOutputViolation =
	| {
			check: Exclude<SclOutputCheck, typeof SCL_OUTPUT_CHECK.xsd>
			/** What kind of violation, within its check (see {@link SclOutputTolerance}). */
			code: string
			description: string
			key: string
	  }
	| {
			check: typeof SCL_OUTPUT_CHECK.xsd
			code: SclXsdCode
			description: string
			key: string
			/** The validator's own message. */
			message: string
	  }

/** What kind of finding of the XSD validator. */
export type SclXsdCode = (typeof SCL_XSD_CODE)[keyof typeof SCL_XSD_CODE]

/**
 * A violation a case may leave: of a check, and of one kind within it when `code` is given (schema: `namespace`,
 * `containment`, `attribute`; xsd: an {@link SclXsdCode}; uniqueness: the constraint name; references: `dangling`,
 * `wrong-target`, `path`, `empty`, `derived`; identity: the warning code).
 */
export type SclOutputTolerance = { check: SclOutputCheck; code?: string }

/**
 * Why a case leaves a document a real file could not be, and the violations it may leave: every other violation it
 * adds still fails it, and a tolerated violation it no longer leaves fails it too (the opt-out is then stale).
 */
export type SclOutputOptOut = { reason: string; violations: readonly SclOutputTolerance[] }

/**
 * What the checks found on a document, and which checks ran: the XSD validator runs only when the schema files are
 * configured, the other checks always.
 */
export type SclOutputReport = {
	checks: readonly SclOutputCheck[]
	violations: SclOutputViolation[]
}

/** The violations of a document before the act: those the act did not add are not reported. */
export type SclOutputBaseline = readonly SclOutputViolation[]

export type CollectSclOutputViolationsParams = {
	project: SclTest.TestProjectResult['project']
	document: SclTest.TestDocument['document']
	/** Read a hand-made test document: a missing Header supplied, test uuids read as uuids. Default `false`. */
	asTestDocument?: boolean
}

export type FindAddedSclOutputViolationsParams = {
	before: readonly SclOutputViolation[]
	after: readonly SclOutputViolation[]
	carried?: readonly SclOutputViolation[]
}

export type IsToleratedParams = {
	tolerances: readonly SclOutputTolerance[]
	violation: SclOutputViolation
}

export type FindStaleTolerancesParams = {
	tolerances: readonly SclOutputTolerance[]
	added: readonly SclOutputViolation[]
	ranChecks: readonly SclOutputCheck[]
}

export type DescribeSclOutputFailureParams = {
	label: string
	failing: readonly SclOutputViolation[]
	stale: readonly SclOutputTolerance[]
	ranChecks: readonly SclOutputCheck[]
}

export type AssertNoNewSclOutputViolationsParams = {
	before: SclOutputBaseline
	after: readonly SclOutputViolation[]
	/** The violations of the documents the act read from: one copied as it was is not new. */
	carried?: readonly SclOutputViolation[]
	/** Names the case and the document in the failure message. */
	label: string
	/** What the case may leave, and why; an empty reason or list is refused. */
	allowInvalidOutput?: SclOutputOptOut
	/** The checks that ran on `after`: a failure says when the XSD validator was not among them. */
	checks?: readonly SclOutputCheck[]
}
