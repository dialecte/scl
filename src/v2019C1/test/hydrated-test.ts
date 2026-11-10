import {
	assertCoherentSclReferences,
	assertCoherentSclReferencesTestCases,
} from './assert-coherent-scl-references'
import { assertAllowInvalidOutputReason } from './assert-scl-output'
import { assertValidSclXml } from './assert-valid-scl-xml'
import {
	assertOutputGateTestCases,
	closeGatedTestProject,
	readOutputBaseline,
	withOutputGate,
} from './output-gate'
import { SCL_TEST_HELPERS } from './scl-test-helpers.constants'
import { FIXTURE_REFERENCES_CHECK_TIMEOUT_MS } from './scl-test-setup.constants'

import { CUSTOM_RECORD_ID_ATTRIBUTE, CUSTOM_RECORD_ID_ATTRIBUTE_NAME } from '@dialecte/core/helpers'
import { beforeAll, onTestFinished } from 'vitest'

import type { AssertCoherentSclReferencesTestCasesParams } from './assert-coherent-scl-references.types'
import type { SclOutputOptOut } from './assert-scl-output.types'
import type { SclTest } from './hydrated-test.types'
import type { GatedDocument, ProjectOutputBaseline } from './output-gate.types'
import type { Config } from '@/v2019C1/config/dialecte.config'
import type { TestHelpers, XmlAssertions } from '@dialecte/core/test'

export {
	ALL_XMLNS_NAMESPACES,
	XMLNS_SCL_6_100_NAMESPACE,
	XMLNS_SCL_NAMESPACE,
} from './scl-xmlns.constants'
export { CUSTOM_RECORD_ID_ATTRIBUTE, CUSTOM_RECORD_ID_ATTRIBUTE_NAME }
export { assertCoherentSclReferences } from './assert-coherent-scl-references'
export { assertNoNewSclOutputViolations, collectSclOutputViolations } from './assert-scl-output'
export { assertValidSclXml } from './assert-valid-scl-xml'

/**
 * The declaration's test runner, which checks every registered case's XML against the SCL schema, wrapped so the
 * cases are also checked for coherent references before the suite runs (see
 * {@link assertCoherentSclReferencesTestCases}) and the documents each case leaves are checked after its act (see
 * {@link withOutputGate}): a violation the act added fails the case. All failing cases are reported at once.
 */
export const runSclTestCases: SclTest.TestRunner = {
	...SCL_TEST_HELPERS.runTestCases,
	withExport(params) {
		checkReferencesBeforeTheSuite({ testCases: params.testCases })
		assertOutputGateTestCases({ testCases: params.testCases })
		SCL_TEST_HELPERS.runTestCases.withExport({
			...params,
			act: withOutputGate({ act: params.act, testCases: params.testCases }),
		})
	},
	withoutExport(params) {
		checkReferencesBeforeTheSuite({ testCases: params.testCases })
		assertOutputGateTestCases({ testCases: params.testCases })
		SCL_TEST_HELPERS.runTestCases.withoutExport({
			...params,
			act: withOutputGate({ act: params.act, testCases: params.testCases }),
		})
	},
}

/**
 * Check the references of every case before the suite's first case runs, all incoherent cases in one failure: the
 * check reads each fixture through a test project, which a suite being collected cannot await.
 */
function checkReferencesBeforeTheSuite(params: AssertCoherentSclReferencesTestCasesParams): void {
	const { testCases } = params
	beforeAll(async function checkFixtureReferences() {
		await assertCoherentSclReferencesTestCases({ testCases })
	}, FIXTURE_REFERENCES_CHECK_TIMEOUT_MS)
}

/**
 * Open a test project with `sourceXml` (and `targetXml`) imported, the fixtures checked first. The test owns it
 * until it finishes; then the documents it leaves are checked (a violation the test added fails it unless the test
 * failed already or `allowInvalidOutput` lists it; a stale opt-out fails it too) and the project is destroyed. Call it inside a test, and
 * do not destroy the project yourself.
 *
 * The output check validates against the XSD only once `configureSclXsdSchemas` has said where the schema files are;
 * without them that check is skipped silently, and the structure (namespaces, allowed children, known attributes),
 * key uniqueness among siblings, coherent references and uuid identity are still checked.
 *
 * @intent open an SCL project in a test with fixtures imported, get source and target SCL documents to test against, assert the SCL output is valid against the XSD in a test
 */
export async function createSclTestProject(params: {
	sourceXml: string
	targetXml?: string
	dev?: { perf?: boolean }
	/** The reason the fixtures NEED an incoherent reference; they are then left unchecked. */
	allowIncoherentReferences?: string
	/** The violations the test may leave in its documents, and why; any other violation still fails it. */
	allowInvalidOutput?: SclOutputOptOut
}) {
	const { sourceXml, targetXml, dev, allowIncoherentReferences, allowInvalidOutput } = params
	assertAllowInvalidOutputReason({ allowInvalidOutput, label: 'createSclTestProject' })
	assertValidSclXml({ xml: sourceXml, label: 'sourceXml', requireComplete: false })
	if (targetXml) assertValidSclXml({ xml: targetXml, label: 'targetXml', requireComplete: false })
	if (!allowIncoherentReferences) {
		await assertCoherentSclReferences({ xml: sourceXml, label: 'sourceXml' })
		if (targetXml) await assertCoherentSclReferences({ xml: targetXml, label: 'targetXml' })
	}

	// core destroys the project when the test ends, whatever happens after it is opened
	const result = await SCL_TEST_HELPERS.createTestProject({ sourceXml, targetXml, dev })

	// the test's end runs its hooks last registered first: registered after core's, the check reads the documents
	// before core destroys the project. Outside a running test vitest refuses the hook: the project goes, and so does
	// the call
	const opened: { baseline: ProjectOutputBaseline } = { baseline: { documents: [] } }
	try {
		onTestFinished(async function closeSclTestProject(context) {
			await closeGatedTestProject({
				project: result.project,
				baseline: opened.baseline,
				label: context.task.name,
				allowInvalidOutput,
				testFailed: context.task.result?.state === 'fail',
			})
		})
	} catch (error) {
		await result.project.destroy()
		throw error
	}

	const documents: GatedDocument[] = [{ role: 'source', document: result.source.document }]
	if (result.target) documents.push({ role: 'target', document: result.target.document })
	opened.baseline = await readOutputBaseline({ project: result.project, documents })
	return result
}

/**
 * Build a typed SCL record for a unit test (raw by default, or `type: 'tracked'` / `'tree'`): the tag names and
 * attributes are SCL's, and the record is standardized as the store would hold it.
 *
 * @intent build an SCL record for a unit test, test a pure function or helper on an SCL record without a project
 */
export const createSclTestRecord: TestHelpers<Config, SclTest.Modules>['createTestRecord'] =
	SCL_TEST_HELPERS.createTestRecord

/**
 * Assert that each XPath query matches at least one element of an SCL document's XML text (`{ xml, queries }`, the
 * text an export gives), the prefixes already bound to SCL's namespaces (`default:` for SCL, `v2019C1:` for
 * 6-100): no namespace resolver to pass. A failure names the step that matched nothing and shows the XML of the last
 * match.
 *
 * @intent assert an exported SCL document holds an element, check an exported SCL document with XPath in a test, query SCL elements by namespace prefix
 */
export const assertExpectedElementQueries: XmlAssertions['assertExpectedElementQueries'] =
	SCL_TEST_HELPERS.assertExpectedElementQueries

/**
 * Assert that no XPath query matches an element of an SCL document's XML text (`{ xml, queries }`, the text an
 * export gives), the prefixes already bound to SCL's namespaces (`default:` for SCL, `v2019C1:` for 6-100). Every
 * step but the last must still match: a missing ancestor fails the assertion instead of passing it for the wrong
 * reason.
 *
 * @intent assert an exported SCL document no longer holds an element, check an SCL element was removed, assert absence with XPath in a test
 */
export const assertUnexpectedElementQueries: XmlAssertions['assertUnexpectedElementQueries'] =
	SCL_TEST_HELPERS.assertUnexpectedElementQueries
