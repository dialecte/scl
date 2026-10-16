import { readIedSection } from './ied-section'
import { readProcessSection } from './process-section'

import { createInfoContext } from '@/v2019C1/extensions/info/query/info-context'

import type { DataflowContext } from './dataflow-context.types'
import type { IedSection } from './ied-section.types'
import type { ProcessSection } from './process-section.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** A context whose facts are read on first use and kept for the rest of the call. */
export function createDataflowContext(query: Core.Query<Config>): DataflowContext {
	let processSection: Promise<ProcessSection> | undefined
	let iedSection: Promise<IedSection> | undefined

	return {
		...createInfoContext(query),
		processSection() {
			processSection ??= readProcessSection(query)
			return processSection
		},
		iedSection() {
			iedSection ??= readIedSection(query)
			return iedSection
		},
	}
}
