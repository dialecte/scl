import { CUSTOM_RECORD_ID_ATTRIBUTE, CUSTOM_RECORD_ID_ATTRIBUTE_NAME } from '@dialecte/core/helpers'
import {
	createTestDialecte,
	createTestRecordFactory,
	createXmlAssertions,
	runTestCases,
	XMLNS_DEV_NAMESPACE,
} from '@dialecte/core/test'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'

import type { SclTest } from './hydrated-test.types'
import type { Config } from '@/v2019C1/config/dialecte.config'

export const XMLNS_SCL_NAMESPACE = `xmlns="http://www.iec.ch/61850/2003/SCL"`
export const XMLNS_SCL_6_100_NAMESPACE = `xmlns:eIEC61850-6-100="http://www.iec.ch/61850/2019/SCL/6-100"`
export const ALL_XMLNS_NAMESPACES = `${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE}`
export { CUSTOM_RECORD_ID_ATTRIBUTE, CUSTOM_RECORD_ID_ATTRIBUTE_NAME }

export function runSclTestCases<GenericTestCase extends SclTest.BaseTestCase>(params: {
	testCases: SclTest.TestCases<GenericTestCase>
	act: (params: SclTest.ActParams<GenericTestCase>) => Promise<SclTest.ActResult>
}): void {
	return runTestCases({
		...params,
		dialecteConfig: SCL_DIALECTE_CONFIG,
	})
}

export async function createSclTestDialecte(params: { xmlString: string }) {
	const { xmlString } = params

	return await createTestDialecte({
		xmlString,
		dialecteConfig: SCL_DIALECTE_CONFIG,
	})
}

export const createSclTestRecord = createTestRecordFactory<Config>(SCL_DIALECTE_CONFIG)
export const { assertExpectedElementQueries, assertUnexpectedElementQueries } = createXmlAssertions(
	{
		namespaces: SCL_DIALECTE_CONFIG.namespaces,
	},
)
