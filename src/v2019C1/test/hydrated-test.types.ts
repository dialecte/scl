import { SCL_EXTENSION_MODULES } from '../extensions'

import type { SclOutputOptOut } from './assert-scl-output.types'
import type { Config } from '@/v2019C1/config/dialecte.config'
import type * as CoreTest from '@dialecte/core/test'

export namespace SclTest {
	/** The extensions every SCL test project is opened with. */
	export type Modules = typeof SCL_EXTENSION_MODULES
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
		/**
		 * Set when the case NEEDS a given document (source or target) that a real file could not be
		 * (a duplicate key, a rule broken on purpose): the reason it does and the violations the given
		 * documents hold before the act. Any other violation fails the case before the act; a listed
		 * violation the documents lack fails it too; an empty reason or list, an `xsd` tolerance, or a `references`
		 * one (`allowIncoherentReferences` covers references), is refused.
		 */
		allowInvalidFixture?: SclOutputOptOut
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
