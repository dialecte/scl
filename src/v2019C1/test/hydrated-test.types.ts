import type { Config } from '@/v2019C1/config/dialecte.config'
import type * as CoreTest from '@dialecte/core/test'

export namespace SclTest {
	export type BaseTestCase = CoreTest.BaseTestCase
	export type BaseXmlTestCase = CoreTest.BaseXmlTestCase
	export type TestCases<T extends BaseTestCase = BaseXmlTestCase> = Record<string, T>
	export type TestContext = CoreTest.TestContext<Config>
	export type ActParams<T extends CoreTest.BaseXmlTestCase> = CoreTest.ActParams<Config, T>
	export type ActResult = CoreTest.ActResult
	export type TestRunner = CoreTest.TestRunner<Config>
}
