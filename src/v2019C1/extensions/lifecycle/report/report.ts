import { markPlacementConflicts } from './mark-placement-conflicts'
import { reportAsd, reportFsd } from './query'

import { editableAttributes } from '@/v2019C1/extensions/lifecycle/constraints'

import type { Config } from '@/v2019C1/config'
import type { EditableAttribute } from '@/v2019C1/extensions/lifecycle/constraints'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { AttributeChange, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * `query.lifecycle.report` — the generic read-only classify surface (ENGINE.md §6).
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
		group.editableAttributes = withChangeDeltas(
			editableAttributes(group.primary.tagName),
			group.primary.attributeChanges,
		)
	}

	// flag placement collisions (resolvable auto-value or identity-locked skip/adopt)
	await markPlacementConflicts(query, target, report)

	return report
}

/**
 * Annotate a tag's editable attributes with the group's modification deltas (`before`
 * = instance current, `after` = template incoming) and surface changed attributes
 * first, so the UI renders the changed editable fields prominently (with a "keep
 * current" affordance) and offers the unchanged ones as secondary "edit other fields".
 */
function withChangeDeltas(
	editable: EditableAttribute[],
	changes: AttributeChange[] | undefined,
): EditableAttribute[] {
	if (!changes?.length) return editable
	const byName = new Map(changes.map((change) => [change.name, change]))
	return editable
		.map((entry) => {
			const change = byName.get(entry.attr)
			return change
				? { ...entry, before: change.before, after: change.after, changed: true }
				: entry
		})
		.sort((a, b) => Number(b.changed ?? false) - Number(a.changed ?? false))
}
