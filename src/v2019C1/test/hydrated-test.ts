import {
	assertCoherentSclReferences,
	assertCoherentSclReferencesTestCases,
} from './assert-coherent-scl-references'
import { assertAllowInvalidOutputReason } from './assert-scl-output'
import { assertValidSclTestCases, assertValidSclXml } from './assert-valid-scl-xml'
import {
	assertOutputGateTestCases,
	closeGatedTestProject,
	readOutputBaseline,
	withOutputGate,
} from './output-gate'
import { SCL_TEST_SETUP } from './scl-test-setup.constants'

import { CUSTOM_RECORD_ID_ATTRIBUTE, CUSTOM_RECORD_ID_ATTRIBUTE_NAME } from '@dialecte/core/helpers'
import {
	createTestProject,
	createTestRecordFactory,
	createXmlAssertions,
	createTestRunner,
} from '@dialecte/core/test'
import { onTestFinished } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'

import type { SclOutputOptOut } from './assert-scl-output.types'
import type { SclTest } from './hydrated-test.types'
import type { GatedDocument, ProjectOutputBaseline } from './output-gate.types'
import type { Config } from '@/v2019C1/config/dialecte.config'
import type { XmlAssertions } from '@dialecte/core/test'

export {
	ALL_XMLNS_NAMESPACES,
	XMLNS_SCL_6_100_NAMESPACE,
	XMLNS_SCL_NAMESPACE,
} from './scl-xmlns.constants'
export { CUSTOM_RECORD_ID_ATTRIBUTE, CUSTOM_RECORD_ID_ATTRIBUTE_NAME }
export { assertCoherentSclReferences } from './assert-coherent-scl-references'
export { assertNoNewSclOutputViolations, collectSclOutputViolations } from './assert-scl-output'
export { assertValidSclXml } from './assert-valid-scl-xml'

const rawRunSclTestCases = createTestRunner<Config, SclTest.Modules>(SCL_TEST_SETUP)

/**
 * `createTestRunner`, wrapped so every registered case's XML is checked before the suite runs —
 * against the SCL schema (see {@link assertValidSclTestCases}), then for coherent references
 * (see {@link assertCoherentSclReferencesTestCases}) — and the documents each case leaves are checked
 * after its act (see {@link withOutputGate}): a violation the act added fails the case. All failing
 * cases are reported at once.
 */
export const runSclTestCases: typeof rawRunSclTestCases = {
	...rawRunSclTestCases,
	withExport(params) {
		assertValidSclTestCases({ testCases: params.testCases })
		assertCoherentSclReferencesTestCases({ testCases: params.testCases })
		assertOutputGateTestCases({ testCases: params.testCases })
		rawRunSclTestCases.withExport({
			...params,
			act: withOutputGate({ act: params.act, testCases: params.testCases }),
		})
	},
	withoutExport(params) {
		assertValidSclTestCases({ testCases: params.testCases })
		assertCoherentSclReferencesTestCases({ testCases: params.testCases })
		assertOutputGateTestCases({ testCases: params.testCases })
		rawRunSclTestCases.withoutExport({
			...params,
			act: withOutputGate({ act: params.act, testCases: params.testCases }),
		})
	},
}

/**
 * Open a test project with `sourceXml` (and `targetXml`) imported, the fixtures checked first. The test owns it
 * until it finishes; then the documents it leaves are checked (a violation the test added fails it unless the test
 * failed already or `allowInvalidOutput` lists it; a stale opt-out fails it too) and the project is destroyed. Call it inside a test, and
 * do not destroy the project yourself.
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
		assertCoherentSclReferences({ xml: sourceXml, label: 'sourceXml' })
		if (targetXml) assertCoherentSclReferences({ xml: targetXml, label: 'targetXml' })
	}

	// core destroys the project when the test ends, whatever happens after it is opened
	const result = await createTestProject<Config, SclTest.Modules>({
		sourceXml,
		targetXml,
		...SCL_TEST_SETUP,
		dev,
	})

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

export const createSclTestRecord = createTestRecordFactory<Config>(SCL_DIALECTE_CONFIG)
const sclXmlAssertions = createXmlAssertions({ namespaces: SCL_DIALECTE_CONFIG.namespaces })
export const assertExpectedElementQueries: XmlAssertions['assertExpectedElementQueries'] =
	sclXmlAssertions.assertExpectedElementQueries
export const assertUnexpectedElementQueries: XmlAssertions['assertUnexpectedElementQueries'] =
	sclXmlAssertions.assertUnexpectedElementQueries
