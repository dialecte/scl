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
import { HOOKS } from '@/v2019C1/hooks'

import type { Config } from '@/v2019C1/config/dialecte.config'

type SclModules = typeof SCL_EXTENSION_MODULES

export const XMLNS_SCL_NAMESPACE = `xmlns="${SCL_DIALECTE_CONFIG.namespaces.default.uri}"`
export const XMLNS_SCL_6_100_NAMESPACE = `xmlns:${SCL_DIALECTE_CONFIG.namespaces.v2019C1.prefix}="${SCL_DIALECTE_CONFIG.namespaces.v2019C1.uri}"`
export const ALL_XMLNS_NAMESPACES = `${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE} ${XMLNS_XSI_NAMESPACE}`
export { CUSTOM_RECORD_ID_ATTRIBUTE, CUSTOM_RECORD_ID_ATTRIBUTE_NAME }

const SCL_EXTENSIONS = { base: SCL_EXTENSION_MODULES }

export const runSclTestCases = createTestRunner<Config, SclModules>({
	dialecteConfig: SCL_DIALECTE_CONFIG,
	hooks: HOOKS,
	extensions: SCL_EXTENSIONS,
})

export async function createSclTestProject(params: { sourceXml: string; targetXml?: string }) {
	const { sourceXml, targetXml } = params

	return createTestProject<Config, SclModules>({
		sourceXml,
		targetXml,
		dialecteConfig: SCL_DIALECTE_CONFIG,
		extensions: SCL_EXTENSIONS,
		hooks: HOOKS,
	})
}

export const createSclTestRecord = createTestRecordFactory<Config>(SCL_DIALECTE_CONFIG)
export const { assertExpectedElementQueries, assertUnexpectedElementQueries } = createXmlAssertions(
	{
		namespaces: SCL_DIALECTE_CONFIG.namespaces,
	},
)
