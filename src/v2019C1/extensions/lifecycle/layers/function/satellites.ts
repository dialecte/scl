import { toRef } from '@dialecte/core/helpers'

import { reference } from '@/v2019C1/extensions/reference'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The function layer's SATELLITE container tags: elements that live OUTSIDE the
 * function subtree but reference back into it and therefore travel with the
 * function (90-30 SCL-Location). The function layer OWNS this list explicitly —
 * satellites are a per-layer concern, not a generic engine data hook.
 *
 * v1 = FunctionCategory (via `FunctionCatRef`). Variable / BehaviorDescription
 * are planned satellites (see the layer checklist) and will be added here with
 * their own clone handlers.
 */
const FUNCTION_SATELLITE_CONTAINERS = ['FunctionCategory'] as const

/**
 * Resolve the function-layer satellites carried by a function: the external
 * containers (e.g. `FunctionCategory`) that reference the function — or any of
 * its `SubFunction` descendants — via a reverse edge (`findRefsPointingTo`). This
 * is the shared "find" the report fold and the apply reconcile both dispatch to.
 */
export async function resolveFunctionSatellites(
	query: Core.Query<Config>,
	params: { primaryRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'> },
): Promise<Scl.Ref<Scl.ElementsOf>[]> {
	const { primaryRef } = params

	// the function itself plus its SubFunction descendants may each carry satellites
	const targets: Scl.Ref<Scl.ElementsOf>[] = [primaryRef]
	const { SubFunction: subFunctions = [] } = await query.findDescendants(primaryRef, {
		collect: 'SubFunction',
	})
	for (const subFunction of subFunctions) {
		targets.push({ tagName: 'SubFunction', id: subFunction.id })
	}

	const seen = new Set<string>()
	const satellites: Scl.Ref<Scl.ElementsOf>[] = []

	for (const target of targets) {
		for (const containerTag of FUNCTION_SATELLITE_CONTAINERS) {
			const refs = await reference.query.findRefsPointingTo(query, {
				target,
				containerTagName: containerTag,
			})
			for (const { container } of refs) {
				if (!container || seen.has(container.id)) continue
				seen.add(container.id)
				satellites.push(toRef(container) as Scl.Ref<Scl.ElementsOf>)
			}
		}
	}
	return satellites
}
