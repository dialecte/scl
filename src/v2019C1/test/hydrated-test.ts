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

import {
	CUSTOM_RECORD_ID_ATTRIBUTE,
	CUSTOM_RECORD_ID_ATTRIBUTE_NAME,
	XMLNS_XSI_NAMESPACE,
} from '@dialecte/core/helpers'
import {
	createTestProject,
	createTestRecordFactory,
	createXmlAssertions,
	createTestRunner,
	XMLNS_DEV_NAMESPACE,
} from '@dialecte/core/test'
import { onTestFinished } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'

import type { SclOutputOptOut } from './assert-scl-output.types'
import type { SclTest } from './hydrated-test.types'
import type { GatedDocument, ProjectOutputBaseline } from './output-gate.types'
import type { Config } from '@/v2019C1/config/dialecte.config'

type SclModules = typeof SCL_TEST_SETUP.extensions.base

export const XMLNS_SCL_NAMESPACE = `xmlns="${SCL_DIALECTE_CONFIG.namespaces.default.uri}"`
export const XMLNS_SCL_6_100_NAMESPACE = `xmlns:${SCL_DIALECTE_CONFIG.namespaces.v2019C1.prefix}="${SCL_DIALECTE_CONFIG.namespaces.v2019C1.uri}"`
export const ALL_XMLNS_NAMESPACES = `${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE} ${XMLNS_XSI_NAMESPACE}`
export { CUSTOM_RECORD_ID_ATTRIBUTE, CUSTOM_RECORD_ID_ATTRIBUTE_NAME }
export { assertCoherentSclReferences } from './assert-coherent-scl-references'
export { assertNoNewSclOutputViolations, collectSclOutputViolations } from './assert-scl-output'
export { assertValidSclXml } from './assert-valid-scl-xml'

const rawRunSclTestCases = createTestRunner<Config, SclModules>(SCL_TEST_SETUP)

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
	assertValidSclXml(sourceXml, 'sourceXml', { requireComplete: false })
	if (targetXml) assertValidSclXml(targetXml, 'targetXml', { requireComplete: false })
	if (!allowIncoherentReferences) {
		assertCoherentSclReferences({ xml: sourceXml, label: 'sourceXml' })
		if (targetXml) assertCoherentSclReferences({ xml: targetXml, label: 'targetXml' })
	}

	// registered first, so a project opened by a call outside a test is never left behind
	const opened: {
		project?: SclTest.TestProjectResult['project']
		baseline: ProjectOutputBaseline
	} = { baseline: { documents: [] } }
	onTestFinished(async function closeSclTestProject(context) {
		if (!opened.project) return
		await closeGatedTestProject({
			project: opened.project,
			baseline: opened.baseline,
			label: context.task.name,
			allowInvalidOutput,
			testFailed: context.task.result?.state === 'fail',
		})
	})

	const result = await createTestProject<Config, SclModules>({
		sourceXml,
		targetXml,
		...SCL_TEST_SETUP,
		dev,
	})
	opened.project = result.project
	const documents: GatedDocument[] = [{ role: 'source', document: result.source.document }]
	if (result.target) documents.push({ role: 'target', document: result.target.document })
	opened.baseline = await readOutputBaseline({ project: result.project, documents })
	return result
}

export const createSclTestRecord = createTestRecordFactory<Config>(SCL_DIALECTE_CONFIG)
export const { assertExpectedElementQueries, assertUnexpectedElementQueries } = createXmlAssertions(
	{
		namespaces: SCL_DIALECTE_CONFIG.namespaces,
	},
)
