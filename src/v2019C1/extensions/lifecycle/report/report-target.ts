import type { Config } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type {
	ReportedElement,
	ReportTarget,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/**
 * The target a report is made for, read from the target it is asked for and the documents: what `apply` compares the
 * report with. The operation is `template` when none is asked for.
 */
export async function reportTargetOf(
	query: Core.Query<Config>,
	target: LifecycleTarget,
): Promise<ReportTarget> {
	const { id: document } = await query.getDocumentInfo()
	const { id: source } = await target.sourceQuery.getDocumentInfo()
	return {
		document,
		source,
		verb: target.verb,
		ref: reportedElement(target.ref),
		anchor: reportedElement(target.anchor),
		scenario: target.scenario ?? 'template',
		...(target.targetInstance ? { targetInstance: reportedElement(target.targetInstance) } : {}),
	}
}

/** An element as a report names it: its tag and record id. */
export function reportedElement(element: AnyRefOrRecord): ReportedElement {
	return { tagName: element.tagName, id: element.id }
}
