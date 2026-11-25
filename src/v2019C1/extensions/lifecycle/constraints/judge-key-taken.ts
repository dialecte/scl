import { classifyAttribute, isEditableMode } from './classify-attribute'
import { findViolationInScope, readConstraintScope } from './find-constraint-violation'
import { identityCollisionInScope } from './find-identity-collision'
import { findUniqueValueInScope } from './resolve-unique-value'

import type { JudgedKey, JudgeKeyTakenParams, KeyTaken } from './judge-key-taken.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * What an element shares with its siblings where it sits or lands, over the scope read once: the first constraint whose
 * key has an editable field gives the key taken, by whom, and the values the engine numbers instead (as
 * `resolvePlacementCollision` writes them); a key none of whose fields can be changed gives an identity collision, as
 * the commit refuses it (siblings a tuple reference tells apart by uuid not compared).
 */
export async function judgeKeyTaken(
	query: Core.Query<Config>,
	params: JudgeKeyTakenParams,
): Promise<JudgedKey> {
	const { parentRef, tagName, excludeId } = params
	const candidate: Record<string, string | undefined> = { ...params.candidate }
	const scope = await readConstraintScope(query, { parentRef, childTag: tagName })
	if (scope.constraints.length === 0) return {}
	const identityCollision = identityCollisionInScope({ scope, tagName, candidate, excludeId })
	const judged: JudgedKey = identityCollision ? { identityCollision } : {}
	for (const constraint of scope.constraints) {
		const violation = findViolationInScope({
			scope: { ...scope, constraints: [constraint] },
			candidate,
			excludeId,
		})
		if (!violation) continue
		const editable = violation.fields.filter((field) => isEditable({ tagName, attribute: field }))
		if (editable.length === 0) continue
		const taken: KeyTaken = {
			constraint: violation.constraint,
			values: Object.fromEntries(violation.fields.map((field) => [field, candidate[field] ?? ''])),
			takenBy: takenByOf({ scope, id: violation.offendingId }),
			proposed: Object.fromEntries(
				editable.slice(0, 1).map((field) => [
					field,
					findUniqueValueInScope({
						scope,
						parentRef,
						childTag: tagName,
						candidate,
						attr: field,
						excludeId,
					}),
				]),
			),
		}
		return { ...judged, keyTaken: taken }
	}
	return judged
}

/** Whether an attribute of a tag is one a review may edit (`rename` or `free`). */
export function isEditable(params: { tagName: string; attribute: string }): boolean {
	return isEditableMode(classifyAttribute(params.tagName, params.attribute))
}

/** The sibling of the scope a violation names, by its record id. */
function takenByOf(params: {
	scope: { children: readonly Core.AnyTreeRecord[] }
	id: string
}): KeyTaken['takenBy'] {
	const sibling = params.scope.children.find((child) => child.id === params.id)
	return { tagName: sibling?.tagName ?? '', id: params.id }
}
