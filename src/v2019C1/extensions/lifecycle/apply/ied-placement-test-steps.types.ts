import type { Config } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

export type ImportSourceParams = {
	project: SclTest.ActParams<SclTest.BaseXmlTestCase>['project']
	xml: string
	fileName: string
}

export type OnlyIedParams = { sourceQuery: Core.Query<Config> }
