import {
	collectReferenceViolations,
	describeReferenceViolation,
} from './assert-coherent-scl-references'
import {
	SCHEMA_LINE_CODE,
	SCHEMA_LINE_CODE_UNKNOWN,
	SCL_CHILD_ORDER,
	SCL_OUTPUT_CHECK,
	SCL_XSD_CODE,
	SCL_XSD_CODE_MESSAGES,
	TEST_HEADER,
	TEST_UUID,
	UUID_PATTERNS,
	XSD_EXPECTED_LIST,
	XSD_PATTERN_REFUSAL,
	XSD_UNREAD_KEY_VALUE_NOTE,
} from './assert-scl-output.constants'
import { assertValidSclXml } from './assert-valid-scl-xml'
import { collectSclXsdViolations } from './scl-xsd'

import { resolveDefinition } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import {
	constraintsSelecting,
	findViolationInScope,
} from '@/v2019C1/extensions/lifecycle/constraints'
import { checkTemplateUuids } from '@/v2019C1/extensions/lifecycle/validate'
import { readAttribute, readAttributes } from '@/v2019C1/helpers'

import type {
	AssertNoNewSclOutputViolationsParams,
	CollectSclOutputViolationsParams,
	DescribeSclOutputFailureParams,
	FindAddedSclOutputViolationsParams,
	FindStaleTolerancesParams,
	IsToleratedParams,
	SclOutputCheck,
	SclOutputOptOut,
	SclOutputReport,
	SclOutputTolerance,
	SclOutputViolation,
	SclXsdCode,
} from './assert-scl-output.types'
import type { AnyTreeRecord, ResolvedDefinition } from '@dialecte/core'

/**
 * Everything on a document that a real file could not hold, in the order of {@link SCL_OUTPUT_CHECK}: its exported
 * XML checked structurally, by the XSD validator and for coherent references; its tree for two children of one
 * parent with one key; its uuids and template uuids. The report lists the checks that ran: without the schema files
 * (see `configureSclXsdSchemas`) the XSD validator does not, and the other checks still do.
 *
 * `asTestDocument` reads a hand-made test document: a missing Header is supplied before the validator runs (without
 * it the validator checks nothing past the root's first child), and a test uuid (see {@link TEST_UUID}) is read as
 * a uuid, with the validator's notes on the keys that could not read it. Any other
 * value the schema refuses as a uuid is still reported.
 */
export async function collectSclOutputViolations(
	params: CollectSclOutputViolationsParams,
): Promise<SclOutputReport> {
	const { project, document, asTestDocument = false } = params

	const { xmlDocument } = await project.export({
		documentId: document.documentId,
		indent: false,
		xmlDocument: true,
	})
	if (asTestDocument) supplyMissingHeader(xmlDocument)
	const xml = new XMLSerializer().serializeToString(xmlDocument)
	const tree = await document.query.getSnapshot({ as: 'tree' })
	const identityWarnings = await checkTemplateUuids(document.query)
	const xsd = await collectXsdViolations({ xml })

	const violations: SclOutputViolation[] = [
		...collectSchemaViolations({ xml }),
		...(xsd ?? []),
		...collectUniquenessViolations({ tree }),
		...collectReferenceViolations({ xml }).map((violation) =>
			describedBy({
				check: SCL_OUTPUT_CHECK.references,
				code: violation.kind,
				line: describeReferenceViolation(violation),
			}),
		),
		...identityWarnings.map((warning) =>
			describedBy({
				check: SCL_OUTPUT_CHECK.identity,
				code: warning.code,
				line: `${warning.code}: ${warning.message}`,
			}),
		),
	]
	const checks = Object.values(SCL_OUTPUT_CHECK).filter(
		(check) => check !== SCL_OUTPUT_CHECK.xsd || xsd !== undefined,
	)
	return { checks, violations: asTestDocument ? withoutTestUuidFindings(violations) : violations }
}

/**
 * Throw with every violation of `after` that `before` did not hold (compared by key, each occurrence counted: a
 * second copy of a violation already there is new), unless `carried` holds it: a violation of the documents the
 * act read from, copied as it was, each copy counted. A case's opt-out tolerates the violations it lists, and only
 * those; a tolerance no added violation matches, for a check that ran, fails the case (the opt-out is stale). An
 * opt-out with an empty reason or no violation is refused.
 */
export function assertNoNewSclOutputViolations(params: AssertNoNewSclOutputViolationsParams): void {
	const { before, after, carried = [], label, allowInvalidOutput, checks } = params
	assertAllowInvalidOutputReason({ allowInvalidOutput, label })

	const added = findAddedSclOutputViolations({ before, after, carried })
	const tolerances = allowInvalidOutput?.violations ?? []
	const ranChecks = checks ?? Object.values(SCL_OUTPUT_CHECK)
	const failure = describeSclOutputFailure({
		label,
		failing: added.filter((violation) => !isTolerated({ tolerances, violation })),
		stale: findStaleTolerances({ tolerances, added, ranChecks }),
		ranChecks,
	})
	if (failure) throw new Error(failure)
}

/**
 * The violations of `after` that `before` and `carried` do not hold, each occurrence counted (a second copy of a
 * violation already there is new).
 */
export function findAddedSclOutputViolations(
	params: FindAddedSclOutputViolationsParams,
): SclOutputViolation[] {
	const { before, after, carried = [] } = params
	return newViolations({ before: [...before, ...carried], after })
}

/** Whether one of an opt-out's tolerances covers a violation. */
export function isTolerated(params: IsToleratedParams): boolean {
	const { tolerances, violation } = params
	return tolerances.some((tolerance) => tolerates({ tolerance, violation }))
}

/** The tolerances of an opt-out that no added violation matches, among the checks that ran: the opt-out is stale. */
export function findStaleTolerances(params: FindStaleTolerancesParams): SclOutputTolerance[] {
	const { tolerances, added, ranChecks } = params
	return tolerances.filter(
		(tolerance) =>
			ranChecks.includes(tolerance.check) &&
			!added.some((violation) => tolerates({ tolerance, violation })),
	)
}

/** The failure message of a document: its violations and the stale tolerances, `undefined` when there are none. */
export function describeSclOutputFailure(
	params: DescribeSclOutputFailureParams,
): string | undefined {
	const { label, failing, stale, ranChecks } = params
	const lines = [
		...failing.map((violation) => violation.description),
		...stale.map(
			(tolerance) =>
				`[opt-out] allows ${tolerance.check}${tolerance.code ? ` ${tolerance.code}` : ''}, which the case no longer leaves: remove it`,
		),
	]
	if (lines.length === 0) return undefined
	const withoutXsd = !ranChecks.includes(SCL_OUTPUT_CHECK.xsd)
	const header = `${label}: the document left is not a valid SCL file${withoutXsd ? ' (checked without the XSD validator)' : ''}:`
	return `${header}\n  ${lines.join('\n  ')}`
}

/** Refuse an opt-out that gives no reason or no violation: they are what a later fix starts from. */
export function assertAllowInvalidOutputReason(params: {
	allowInvalidOutput: SclOutputOptOut | undefined
	label: string
}): void {
	const { allowInvalidOutput, label } = params
	if (allowInvalidOutput === undefined) return
	if (allowInvalidOutput.reason.trim() === '') {
		throw new Error(
			`${label}: allowInvalidOutput needs the reason the case leaves an invalid document, not an empty string`,
		)
	}
	if (allowInvalidOutput.violations.length === 0) {
		throw new Error(
			`${label}: allowInvalidOutput needs the violations the case may leave, not an empty list`,
		)
	}
}

/** Whether a tolerance of an opt-out covers a violation: same check, and same code when it names one. */
function tolerates(params: {
	tolerance: SclOutputTolerance
	violation: SclOutputViolation
}): boolean {
	const { tolerance, violation } = params
	return (
		tolerance.check === violation.check &&
		(tolerance.code === undefined || tolerance.code === violation.code)
	)
}

function newViolations(params: {
	before: readonly SclOutputViolation[]
	after: readonly SclOutputViolation[]
}): SclOutputViolation[] {
	const { before, after } = params
	const remaining = new Map<string, number>()
	for (const violation of before) {
		remaining.set(violation.key, (remaining.get(violation.key) ?? 0) + 1)
	}
	return after.filter((violation) => {
		const count = remaining.get(violation.key) ?? 0
		if (count === 0) return true
		remaining.set(violation.key, count - 1)
		return false
	})
}

/** The structural findings, one per line of the structural check's message (its first line names the document). */
function collectSchemaViolations(params: { xml: string }): SclOutputViolation[] {
	const { xml } = params
	try {
		assertValidSclXml({ xml, label: 'output', requireComplete: false })
		return []
	} catch (error) {
		const [, ...lines] = String(error instanceof Error ? error.message : error).split('\n')
		return lines.map((line) =>
			describedBy({
				check: SCL_OUTPUT_CHECK.schema,
				code: SCHEMA_LINE_CODE.exec(line.trim())?.[1] ?? SCHEMA_LINE_CODE_UNKNOWN,
				line: line.trim(),
			}),
		)
	}
}

/** The findings of the XSD validator, `undefined` when it did not run (no schema files). */
async function collectXsdViolations(params: {
	xml: string
}): Promise<SclOutputViolation[] | undefined> {
	const { xml } = params
	const report = await collectSclXsdViolations({ xml })
	if (!report.ran) return undefined
	return report.violations.map(({ message }) => ({
		check: SCL_OUTPUT_CHECK.xsd,
		code: xsdCodeOf(message),
		description: `[${SCL_OUTPUT_CHECK.xsd}] ${message}`,
		key: `[${SCL_OUTPUT_CHECK.xsd}] ${message.replace(XSD_EXPECTED_LIST, '')}`,
		message,
	}))
}

/**
 * Every child that repeats the key of an earlier sibling, for the unique and key constraints its parent declares
 * where it sits: one walk of the tree, the definition resolved top down, each sibling compared with those before it
 * (a pair is reported once, on its second element).
 */
function collectUniquenessViolations(params: { tree: AnyTreeRecord }): SclOutputViolation[] {
	const { tree } = params
	return collectNodeUniquenessViolations({
		node: tree,
		parentDefinition: undefined,
		path: pathSegmentOf(tree),
	})
}

function collectNodeUniquenessViolations(params: {
	node: AnyTreeRecord
	parentDefinition: ResolvedDefinition | undefined
	path: string
}): SclOutputViolation[] {
	const { node, parentDefinition, path } = params

	const definition = resolveDefinition({
		dialecteConfig: SCL_DIALECTE_CONFIG,
		record: node,
		parentDefinition,
	})
	const ownViolations = definition
		? collectChildrenUniquenessViolations({ parent: node, definition, path })
		: []
	const childViolations = node.tree.flatMap((child) =>
		collectNodeUniquenessViolations({
			node: child,
			parentDefinition: definition,
			path: `${path}/${pathSegmentOf(child)}`,
		}),
	)
	return [...ownViolations, ...childViolations]
}

function collectChildrenUniquenessViolations(params: {
	parent: AnyTreeRecord
	definition: ResolvedDefinition
	path: string
}): SclOutputViolation[] {
	const { parent, definition, path } = params

	const constraintsByTag = new Map(
		[...new Set(parent.tree.map((child) => child.tagName))].map((childTag) => [
			childTag,
			constraintsSelecting({ parentDefinition: definition, childTag }),
		]),
	)

	return parent.tree.flatMap((child, index) => {
		const constraints = constraintsByTag.get(child.tagName) ?? []
		if (constraints.length === 0) return []
		const violation = findViolationInScope({
			scope: { constraints, children: parent.tree.slice(0, index) },
			candidate: readAttributes({ record: child, defaults: 'none' }),
		})
		if (!violation) return []
		const key = violation.fields
			.map(
				(field) => `${field}="${readAttribute({ record: child, name: field, defaults: 'none' })}"`,
			)
			.join(' ')
		return [
			describedBy({
				check: SCL_OUTPUT_CHECK.uniqueness,
				code: violation.constraint,
				line: `<${child.tagName}> ${key} repeats an earlier sibling under ${path} (${violation.constraint})`,
			}),
		]
	})
}

/** A violation of the in-house checks: one line, which is also its key. */
function describedBy(params: {
	check: Exclude<SclOutputCheck, typeof SCL_OUTPUT_CHECK.xsd>
	code: string
	line: string
}): SclOutputViolation {
	const { check, code, line } = params
	const description = `[${check}] ${line}`
	return { check, code, description, key: description }
}

/** The kind of a finding of the XSD validator, read from its message. */
export function xsdCodeOf(message: string): SclXsdCode {
	return SCL_XSD_CODE_MESSAGES.find(([, reads]) => reads.test(message))?.[0] ?? SCL_XSD_CODE.other
}

/** How an element is named in a path: its tag, and its name when it has one. */
function pathSegmentOf(node: AnyTreeRecord): string {
	const name = readAttribute({ record: node, name: 'name', defaults: 'none' })
	return name ? `${node.tagName}[${name}]` : node.tagName
}

/** Give the document the Header it lacks, where the schema places it among the root's children. */
function supplyMissingHeader(xmlDocument: XMLDocument): void {
	const root = xmlDocument.documentElement
	const children = [...root.children]
	if (children.some((child) => child.localName === 'Header')) return

	const header = xmlDocument.createElementNS(root.namespaceURI, 'Header')
	header.setAttribute('id', TEST_HEADER.id)
	header.setAttribute('uuid', TEST_HEADER.uuid)
	const headerPosition = SCL_CHILD_ORDER.indexOf('Header')
	const next = children.find((child) => SCL_CHILD_ORDER.indexOf(child.localName) > headerPosition)
	root.insertBefore(header, next ?? null)
}

/**
 * The violations without those a test uuid causes: the validator refusing one in a uuid attribute, and its notes on
 * the keys that could not read a value it refused.
 */
function withoutTestUuidFindings(violations: readonly SclOutputViolation[]): SclOutputViolation[] {
	return violations.filter((violation) => {
		if (violation.check !== SCL_OUTPUT_CHECK.xsd) return true
		if (XSD_UNREAD_KEY_VALUE_NOTE.test(violation.message)) return false
		return !isTestUuidRefusal(violation.message)
	})
}

/** Whether the validator's message refuses a test uuid written in a uuid attribute. */
function isTestUuidRefusal(message: string): boolean {
	const value = refusedUuidOf(message)
	return value !== undefined && TEST_UUID.test(value)
}

/** The value the validator's message refuses in a uuid attribute, when it refuses one (empty values aside). */
export function refusedUuidOf(message: string): string | undefined {
	const refusal = XSD_PATTERN_REFUSAL.exec(message)
	if (!refusal) return undefined
	const [, , , value, pattern] = refusal
	return UUID_PATTERNS.includes(pattern) && value !== '' ? value : undefined
}
