import { reportAsd, reportFsd } from './update/query'

import { editableAttributes } from '@/v2019C1/extensions/lifecycle/constraints'

import type { LifecycleTarget } from './seam.types'
import type { Config } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * `query.lifecycle.report` — the generic read-only classify seam (ENGINE.md §6).
 *
 * Dispatches on `verb` to the per-layer report and returns a {@link DiffReport}.
 * `report.needsDecisions` tells the consumer the track: `false` = fast (apply
 * headless), `true` = full (resolve decisions first). The consumer never picks
 * the track — dialecte decides it here.
 *
 * Tags each decision group with its primary's editable attributes (schema-derived)
 * so the UI renders inputs straight from the report without re-deriving them.
 */
export async function report(
	query: Core.Query<Config>,
	target: LifecycleTarget,
): Promise<DiffReport> {
	const report =
		target.verb === 'fsd'
			? await reportFsd(query, {
					sourceQuery: target.sourceQuery,
					functionRef: target.ref,
					targetParent: target.anchor,
					scenario: target.scenario,
				})
			: await reportAsd(query, {
					sourceQuery: target.sourceQuery,
					applicationRef: target.ref,
					scenario: target.scenario,
				})

	for (const group of report.groups) {
		group.editableAttributes = editableAttributes(group.primary.tagName)
	}

	return report
}
