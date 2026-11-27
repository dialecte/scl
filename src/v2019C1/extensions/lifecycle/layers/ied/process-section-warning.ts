import { PROCESS_SECTION_TAGS } from './process-section-warning.constants'

import { toRef } from '@dialecte/core/helpers'

import type { ProcessSectionWarningParams } from './process-section-warning.types'
import type { Config } from '@/v2019C1/config'
import type { ReportWarning } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * The warning a first placement from a file other than an ISD gives when the file holds a process part (a
 * `Substation`, a `Process` or a `Line` under its root): that part is not placed, its LNodes are counted. Nothing for an
 * ISD, whose specification is placed, nor for a file without such a section. One read of the root, one of the LNodes.
 */
export async function readProcessSectionWarning(
	sourceQuery: Core.Query<Config>,
	params: ProcessSectionWarningParams,
): Promise<ReportWarning | undefined> {
	const { fileType } = params
	if (!fileType || fileType === 'ISD') return undefined
	const root = await sourceQuery.getRoot()
	if (!root.children.some((child) => isProcessSection(child.tagName))) return undefined
	// a device file holds LNodes in its process part only: one read of them all
	const { LNode = [] } = await sourceQuery.findDescendants(toRef(root), { collect: ['LNode'] })
	return {
		code: 'process-section-not-placed',
		fileType,
		lnodes: LNode.length,
	}
}

/** Whether a child of the root is one of the process sections. */
function isProcessSection(tagName: string): boolean {
	return (PROCESS_SECTION_TAGS as readonly string[]).includes(tagName)
}
