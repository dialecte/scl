import { classifyAttribute } from '@/v2019C1/extensions/lifecycle/constraints/classify-attribute'
import {
	findViolationInScope,
	readConstraintScope,
} from '@/v2019C1/extensions/lifecycle/constraints/find-constraint-violation'
import { findConstraintParent } from '@/v2019C1/extensions/lifecycle/constraints/resolve-placement-collision'
import { findUniqueValueInScope } from '@/v2019C1/extensions/lifecycle/constraints/resolve-unique-value'

import type { NameTaken } from './move.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { IdentityCollision } from '@/v2019C1/extensions/lifecycle/constraints/find-identity-collision.types'
import type * as Core from '@dialecte/core'

/**
 * What the element shares with its siblings where it now sits, each uniqueness constraint judged on its own over the
 * scope read once (through a `Private` wrapper, `findConstraintParent`): a key with an editable field gives the name
 * taken and the name the engine proposes instead (`findUniqueValueInScope`, the numbering `resolvePlacementCollision`
 * writes); a key none of whose fields can be changed gives an identity collision.
 */
export async function judgeMovedName(
	query: Core.Query<Config>,
	params: { ref: Scl.Ref<Scl.ElementsOf> },
): Promise<{ nameTaken?: NameTaken; identityCollision?: IdentityCollision }> {
	const { ref } = params
	const parentRef = await findConstraintParent(query, { ref })
	if (!parentRef) return {}
	const scope = await readConstraintScope(query, { parentRef, childTag: ref.tagName })
	if (scope.constraints.length === 0) return {}
	const candidate: Record<string, string | undefined> = await query.getAttributes(ref)
	const judged: { nameTaken?: NameTaken; identityCollision?: IdentityCollision } = {}
	for (const constraint of scope.constraints) {
		const violation = findViolationInScope({
			scope: { ...scope, constraints: [constraint] },
			candidate,
			excludeId: ref.id,
		})
		if (!violation) continue
		const collidesWith = collidingSibling({ scope, id: violation.offendingId })
		const editable = violation.fields.find((field) =>
			isEditable({ tagName: ref.tagName, attribute: field }),
		)
		if (editable && !judged.nameTaken) {
			judged.nameTaken = {
				attribute: editable,
				value: candidate[editable] ?? '',
				proposed: findUniqueValueInScope({
					scope,
					parentRef,
					childTag: ref.tagName,
					candidate,
					attr: editable,
					excludeId: ref.id,
				}),
				constraint: violation.constraint,
				collidesWith,
			}
		}
		if (!editable && !judged.identityCollision) {
			judged.identityCollision = {
				constraint: violation.constraint,
				fields: violation.fields,
				collidesWith,
			}
		}
	}
	return judged
}

/** Whether an attribute of a tag is one a review may edit (`rename` or `free`). */
export function isEditable(params: { tagName: string; attribute: string }): boolean {
	const mode = classifyAttribute(params.tagName, params.attribute)
	return mode === 'rename' || mode === 'free'
}

/** The sibling of the scope a violation names, by its record id. */
function collidingSibling(params: {
	scope: { children: readonly Core.AnyTreeRecord[] }
	id: string
}): { tagName: string; id: string } {
	const sibling = params.scope.children.find((child) => child.id === params.id)
	return { tagName: sibling?.tagName ?? '', id: params.id }
}
