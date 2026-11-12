import { FUNCTION_SATELLITE_CONTAINERS } from './satellites.constants'

import { toRef } from '@dialecte/core/helpers'

import { sortInDocumentOrder } from '@/v2019C1/extensions/lifecycle/source-root/document-order'
import { reference } from '@/v2019C1/extensions/reference'

import type { Config, Scl } from '@/v2019C1/config'
import type { SourceFunctionRef } from '@/v2019C1/extensions/lifecycle/contract.types'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * Resolve the function-layer satellites carried by a function: the external
 * containers (e.g. `FunctionCategory`) that reference the function — or any of
 * its `SubFunction` descendants — via a reverse edge (`findRefsPointingTo`). This
 * is the shared "find" the report fold and the apply reconcile both dispatch to.
 */
export async function resolveFunctionSatellites(
	query: Core.Query<Config>,
	params: {
		primaryRef: SourceFunctionRef
		/** References left out (record ids): a satellite reached only through them is not resolved. */
		leftOut?: ReadonlySet<string>
	},
): Promise<Scl.Ref<Scl.ElementsOf>[]> {
	const { primaryRef, leftOut } = params

	// the function itself plus its SubFunction descendants may each carry satellites
	const targets: Scl.Ref<Scl.ElementsOf>[] = [primaryRef]
	const { SubFunction: subFunctions = [] } = await query.findDescendants(primaryRef, {
		collect: 'SubFunction',
	})
	for (const subFunction of subFunctions) {
		targets.push({ tagName: 'SubFunction', id: subFunction.id })
	}

	const containers = new Map<string, AnyTrackedRecord>()
	for (const target of targets) {
		for (const containerTag of FUNCTION_SATELLITE_CONTAINERS) {
			const refs = await reference.query.findRefsPointingTo(query, {
				target,
				containerTagName: containerTag,
			})
			for (const { ref, container } of refs) {
				if (!container || containers.has(container.id) || leftOut?.has(ref.id)) continue
				containers.set(container.id, container)
			}
		}
	}
	// a store lists the subfunctions and the references by record id: the satellites follow the document's order
	const ordered = await sortInDocumentOrder(query, { records: [...containers.values()] })
	return ordered.map(function refOf(container) {
		return toRef(container) as Scl.Ref<Scl.ElementsOf>
	})
}
