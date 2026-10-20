import { SCL_EXTENSION_MODULES } from '../extensions'

import type { SclOutputOptOut } from './assert-scl-output.types'
import type { Config } from '@/v2019C1/config/dialecte.config'
import type * as CoreTest from '@dialecte/core/test'

export namespace SclTest {
	export type BaseTestCase = CoreTest.BaseTestCase
	export type BaseXmlTestCase = CoreTest.BaseXmlTestCase & {
		/**
		 * Set when the case NEEDS an incoherent reference (an orphan to clean up, a path to
		 * repair): the reason it does. The case's fixtures are then not checked for coherent
		 * references.
		 */
		allowIncoherentReferences?: string
		/**
		 * Set when the case NEEDS to leave a document a real file could not be (an orphan the
		 * clean-up under test removes later): the reason it does and the violations it may leave.
		 * Any other violation still fails the case; an empty reason or list is refused.
		 */
		allowInvalidOutput?: SclOutputOptOut
	}
	export type TestCases<T extends BaseTestCase = BaseXmlTestCase> = Record<string, T>
	export type TestDocument = CoreTest.TestDocument<Config>
	export type TestProjectResult = CoreTest.TestProjectResult<Config, typeof SCL_EXTENSION_MODULES>
	export type TestRecord = CoreTest.TestRecord<Config>
	export type ActParams<T extends CoreTest.BaseXmlTestCase> = CoreTest.ActParams<
		Config,
		T,
		typeof SCL_EXTENSION_MODULES
	>
	export type ActResult = CoreTest.ActResult
	export type TestRunner = CoreTest.TestRunner<Config, typeof SCL_EXTENSION_MODULES>
}
