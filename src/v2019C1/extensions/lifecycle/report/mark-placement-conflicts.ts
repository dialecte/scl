import { TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'
import {
	classifyAttribute,
	findConstraintViolation,
	isEditableMode,
	resolveUniqueValue,
} from '@/v2019C1/extensions/lifecycle/constraints'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { findInstancesByTemplateUuid } from '@/v2019C1/extensions/lifecycle/instance'

import type { Config, Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

const STRUCTURAL_TAGS: readonly string[] = TOPOLOGY_STRUCTURAL_TAGS

/**
 * Flag the placement collisions of an `instantiate` report that the engine resolves by
 * itself (generic over any scoped-uniqueness constraint, any field combination): when the
 * violated constraint has an editable field (`rename`/`free`) the engine can make a
 * distinct copy, so that editable attribute is flagged with the collision-free
 * `suggestedValue` (the UI shows it; the user may override). No gate.
 *
 * A collision whose key fields are all identity cannot be resolved by changing a value; it
 * is left unflagged here.
 *
 * A structural level is named by its placement mapping (the name is made free where the level
 * lands, which may not be where an earlier instance sits): its `suggestedValue` is that name.
 *
 * `update` never calls this: an identity match there is the reconcile target, not a
 * conflict. The placement parent is taken from an existing instance (same template),
 * which is exactly where the new one would be placed.
 */
export async function markPlacementConflicts(
	query: Core.Query<Config>,
	target: LifecycleTarget,
	report: DiffReport,
): Promise<void> {
	if (target.scenario !== 'instantiate') return

	for (const group of allGroups(report)) {
		if (group.change !== 'added') continue
		const sourceRef = group.primary.sourceRef
		if (!sourceRef) continue

		const candidate = (await target.sourceQuery.getAttributes(
			sourceRef as Scl.Ref<Scl.ElementsOf>,
		)) as Record<string, string | undefined>

		// a structural level is created under the name its placement mapping carries, free where it
		// lands: that name is the one to show, changed by the engine only when the consumer did not
		// choose it
		const placement = report.mappings.find(
			(mapping) => mapping.id === sourceRef.id && mapping.tagName === group.primary.tagName,
		)
		if (placement && STRUCTURAL_TAGS.includes(placement.tagName)) {
			const name = group.editableAttributes?.find((entry) => entry.attr === 'name')
			if (name && placement.mapping && 'create' in placement.mapping) {
				name.suggestedValue = placement.mapping.create.name
				name.conflict =
					placement.reason !== 'decision' && placement.mapping.create.name !== candidate.name
			}
			continue
		}
		const sourceUuid = candidate.uuid
		if (!sourceUuid) continue

		const tagName = group.primary.tagName as Scl.ElementsOf
		const [existing] = await findInstancesByTemplateUuid(query, { tagName, sourceUuid })
		if (!existing) continue // first-time placement — no sibling to collide with

		// A scoped-uniqueness constraint is declared on an ANCESTOR, at a depth that
		// depends on the element: `Bay` for a Function, `Substation` for an Application
		// (its direct parent `Private` is a transparent wrapper — `findConstraintViolation`
		// already unwraps it via `getTree`), `Bay` for a nested LNode, etc. So we don't
		// guess a fixed level: walk up from the existing instance and take the first
		// ancestor whose constraint the candidate would actually violate.
		const ancestors = await query.findAncestors({
			tagName: existing.tagName,
			id: existing.id,
		} as Scl.Ref<Scl.ElementsOf>)
		let parentRef: Scl.Ref<Scl.ElementsOf> | undefined
		let violation: Awaited<ReturnType<typeof findConstraintViolation>> = null
		for (const ancestor of ancestors) {
			const candidateParent = {
				tagName: ancestor.tagName,
				id: ancestor.id,
			} as Scl.Ref<Scl.ElementsOf>
			const hit = await findConstraintViolation(query, {
				parentRef: candidateParent,
				childTag: tagName,
				candidate,
			})
			if (hit) {
				parentRef = candidateParent
				violation = hit
				break
			}
		}
		if (!violation || !parentRef) continue

		const editableField = violation.fields.find((field) =>
			isEditableMode(classifyAttribute(tagName, field)),
		)

		if (!editableField) continue

		// resolvable: surface the auto-resolved value on the editable attribute
		const suggestedValue = await resolveUniqueValue(query, {
			parentRef,
			childTag: tagName,
			candidate,
			attr: editableField,
		})
		const editable = group.editableAttributes?.find((entry) => entry.attr === editableField)
		if (editable) {
			editable.conflict = true
			editable.suggestedValue = suggestedValue
		}
	}
}
