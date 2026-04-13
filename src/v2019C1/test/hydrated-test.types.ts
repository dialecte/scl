import type { Config } from '@/v2019C1/config/dialecte.config'
import type * as CoreTest from '@dialecte/core/test'

export namespace SclTest {
	export type BaseTestCase = CoreTest.BaseXmlTestCase
	export type TestCases<T extends CoreTest.BaseXmlTestCase> = CoreTest.TestCases<T>
	export type ActParams<T extends CoreTest.BaseXmlTestCase> = CoreTest.ActParams<Config, T>
	export type ActResult = CoreTest.ActResult
}
