import {
	assertCoherentSclReferences,
	assertCoherentSclReferencesTestCases,
} from './assert-coherent-scl-references'
import { assertValidSclTestCases, assertValidSclXml } from './assert-valid-scl-xml'

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

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { SCL_EXTENSION_MODULES } from '@/v2019C1/extensions'
import { HOOKS, createSclIoHooks } from '@/v2019C1/hooks'

import type { Config } from '@/v2019C1/config/dialecte.config'

type SclModules = typeof SCL_EXTENSION_MODULES

// All hooks (io + record) provided on the Project instance, mirroring createSclProject.
const SCL_HOOKS = { ...createSclIoHooks(), ...HOOKS }

export const XMLNS_SCL_NAMESPACE = `xmlns="${SCL_DIALECTE_CONFIG.namespaces.default.uri}"`
export const XMLNS_SCL_6_100_NAMESPACE = `xmlns:${SCL_DIALECTE_CONFIG.namespaces.v2019C1.prefix}="${SCL_DIALECTE_CONFIG.namespaces.v2019C1.uri}"`
export const ALL_XMLNS_NAMESPACES = `${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE} ${XMLNS_XSI_NAMESPACE}`
export { CUSTOM_RECORD_ID_ATTRIBUTE, CUSTOM_RECORD_ID_ATTRIBUTE_NAME }
export { assertCoherentSclReferences } from './assert-coherent-scl-references'
export { assertValidSclXml } from './assert-valid-scl-xml'

const SCL_EXTENSIONS = { base: SCL_EXTENSION_MODULES }

const rawRunSclTestCases = createTestRunner<Config, SclModules>({
	dialecteConfig: SCL_DIALECTE_CONFIG,
	extensions: SCL_EXTENSIONS,
	hooks: SCL_HOOKS,
})

/**
 * `createTestRunner`, wrapped so every registered case's XML is checked before the suite runs —
 * against the SCL schema (see {@link assertValidSclTestCases}), then for coherent references
 * (see {@link assertCoherentSclReferencesTestCases}). All failing cases are reported at once.
 */
export const runSclTestCases: typeof rawRunSclTestCases = {
	...rawRunSclTestCases,
	withExport(params) {
		assertValidSclTestCases({ testCases: params.testCases })
		assertCoherentSclReferencesTestCases({ testCases: params.testCases })
		rawRunSclTestCases.withExport(params)
	},
	withoutExport(params) {
		assertValidSclTestCases({ testCases: params.testCases })
		assertCoherentSclReferencesTestCases({ testCases: params.testCases })
		rawRunSclTestCases.withoutExport(params)
	},
}

export async function createSclTestProject(params: {
	sourceXml: string
	targetXml?: string
	dev?: { perf?: boolean }
	/** The reason the fixtures NEED an incoherent reference; they are then left unchecked. */
	allowIncoherentReferences?: string
}) {
	const { sourceXml, targetXml, dev, allowIncoherentReferences } = params
	assertValidSclXml(sourceXml, 'sourceXml', { requireComplete: false })
	if (targetXml) assertValidSclXml(targetXml, 'targetXml', { requireComplete: false })
	if (!allowIncoherentReferences) {
		assertCoherentSclReferences({ xml: sourceXml, label: 'sourceXml' })
		if (targetXml) assertCoherentSclReferences({ xml: targetXml, label: 'targetXml' })
	}

	return createTestProject<Config, SclModules>({
		sourceXml,
		targetXml,
		dialecteConfig: SCL_DIALECTE_CONFIG,
		extensions: SCL_EXTENSIONS,
		hooks: SCL_HOOKS,
		dev,
	})
}

export const createSclTestRecord = createTestRecordFactory<Config>(SCL_DIALECTE_CONFIG)
export const { assertExpectedElementQueries, assertUnexpectedElementQueries } = createXmlAssertions(
	{
		namespaces: SCL_DIALECTE_CONFIG.namespaces,
	},
)
