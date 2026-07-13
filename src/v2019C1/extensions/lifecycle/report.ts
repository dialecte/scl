import { reportAsd, reportFsd } from './update/query'

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
 */
export async function report(
	query: Core.Query<Config>,
	target: LifecycleTarget,
): Promise<DiffReport> {
	if (target.verb === 'fsd') {
		return reportFsd(query, {
			sourceQuery: target.sourceQuery,
			functionRef: target.ref,
			targetParent: target.anchor,
		})
	}

	return reportAsd(query, {
		sourceQuery: target.sourceQuery,
		applicationRef: target.ref,
	})
}
