import { IED_SOURCE_EXTENSIONS } from './report-target.constants'

import { readSourceFileType } from '@/v2019C1/extensions/lifecycle/source-file-type'

import type { Config } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type {
	ReportedElement,
	ReportTarget,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/**
 * The target a report is made for, read from the target it is asked for and the documents: what `apply` compares the
 * report with. The operation is `template` when none is asked for. For an IED, the type of file the source is, read from
 * its extension: an extension no IED is placed from is refused with `OPTION_NOT_AVAILABLE`.
 */
export async function reportTargetOf(
	query: Core.Query<Config>,
	target: LifecycleTarget,
): Promise<ReportTarget> {
	const { id: document } = await query.getDocumentInfo()
	const { id: source } = await target.sourceQuery.getDocumentInfo()
	const fileType = target.verb === 'ied' ? await iedSourceFileType(target.sourceQuery) : undefined
	return {
		document,
		source,
		verb: target.verb,
		ref: reportedElement(target.ref),
		anchor: reportedElement(target.anchor),
		scenario: target.scenario ?? 'template',
		...(target.targetInstance ? { targetInstance: reportedElement(target.targetInstance) } : {}),
		...(fileType ? { fileType } : {}),
	}
}

/** The type of file an IED is placed from, read from the source's extension: another extension is refused. */
async function iedSourceFileType(sourceQuery: Core.Query<Config>): Promise<SclFileType> {
	return readSourceFileType(sourceQuery, {
		accepted: IED_SOURCE_EXTENSIONS,
		operation: 'report (ied)',
	})
}

/** An element as a report names it: its tag and record id. */
export function reportedElement(element: AnyRefOrRecord): ReportedElement {
	return { tagName: element.tagName, id: element.id }
}
