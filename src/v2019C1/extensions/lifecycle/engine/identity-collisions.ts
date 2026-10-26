import { readConstraintScope } from '@/v2019C1/extensions/lifecycle/constraints/find-constraint-violation'
import { identityCollisionInScope } from '@/v2019C1/extensions/lifecycle/constraints/find-identity-collision'

import type { AddedChild, DiffNode, NodeIdentityCollision } from './diff.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { ConstraintScope } from '@/v2019C1/extensions/lifecycle/constraints/find-constraint-violation.types'
import type * as Core from '@dialecte/core'

/**
 * Mark the elements a template adds below an instance element that collide with one of its children on a key none of
 * whose fields can be changed (an `LNode` sharing class, instance, prefix, device and IED): what is added is compared
 * as the template holds it, with the children the instance element holds, one read per tag.
 */
export async function markIdentityCollisions(
	sourceQuery: Core.Query<Config>,
	params: {
		targetQuery: Core.Query<Config>
		parentRef: Scl.Ref<Scl.ElementsOf>
		added: readonly AddedChild[]
	},
): Promise<void> {
	const { targetQuery, parentRef, added } = params
	const scopes = new Map<string, ConstraintScope>()
	for (const { node, source } of added) {
		let scope = scopes.get(node.tagName)
		if (!scope) {
			scope = await readConstraintScope(targetQuery, { parentRef, childTag: node.tagName })
			scopes.set(node.tagName, scope)
		}
		if (scope.constraints.length === 0) continue
		const candidate = await sourceQuery.any.getAttributes(source)
		const collision = identityCollisionInScope({ scope, tagName: node.tagName, candidate })
		if (collision) node.identityCollision = collision
	}
}

/** Every node of `nodes` and their descendants carrying an identity collision, with it. */
export function collectIdentityCollisions(nodes: readonly DiffNode[]): NodeIdentityCollision[] {
	const found: NodeIdentityCollision[] = []
	for (const node of nodes) {
		if (node.identityCollision) found.push({ node, collision: node.identityCollision })
		found.push(...collectIdentityCollisions(node.children))
	}
	return found
}
