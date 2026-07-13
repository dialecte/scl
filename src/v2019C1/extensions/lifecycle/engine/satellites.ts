import { toRef } from '@dialecte/core/helpers'

import { reference } from '@/v2019C1/extensions/reference'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Carry policy (ENGINE.md §16, D-SAT-3): reference tags whose CONTAINER travels
 * as a companion of the primary it points at. This is deliberately DISTINCT from
 * the edge SCHEMA in `UUID_REFERENCE_PAIRS` — it is the lifecycle "travels vs
 * stays open" decision, not the ref structure. `FunctionCatRef.function ->
 * Function` carries its `FunctionCategory`; later-binding refs (e.g.
 * `SourceRef.source -> LNode`) stay OPEN and are intentionally absent here.
 *
 * v1 = FunctionCategory only. Destined to co-locate with the exposed
 * `UUID_REFERENCE_PAIRS` (as a `carry` annotation) / the ownership map (doc 01).
 */
export const CARRIED_SATELLITE_CONTAINERS = {
	FunctionCatRef: 'FunctionCategory',
} as const

/**
 * The distinct satellite CONTAINERS carried by `primaryRef`, resolved by walking
 * the incoming reference edges (`findRefsPointingTo`) whose ref tag is flagged as
 * carrying (see {@link CARRIED_SATELLITE_CONTAINERS}). Same finder the clone path
 * uses (`cloneFunctionCategories`), and like it, satellites carried by the
 * function's `SubFunction` descendants count too.
 */
export async function resolveCarriedSatellites(
	query: Core.Query<Config>,
	params: { primaryRef: Scl.Ref<Scl.ElementsOf> },
): Promise<Scl.Ref<Scl.ElementsOf>[]> {
	const { primaryRef } = params

	// the primary itself plus its SubFunction descendants may each carry satellites
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
		for (const containerTag of Object.values(CARRIED_SATELLITE_CONTAINERS)) {
			const refs = await reference.query.findRefsPointingTo(query, {
				target,
				containerTagName: containerTag as Scl.ElementsOf,
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
