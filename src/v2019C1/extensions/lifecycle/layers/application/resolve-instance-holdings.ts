import { collectInstanceScope } from '@/v2019C1/extensions/lifecycle/instance'
import { resolveHeldLevels } from '@/v2019C1/extensions/lifecycle/layers/topology'

import type {
	InstanceHoldings,
	ResolveInstanceHoldingsParams,
} from './resolve-instance-holdings.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { InstanceCounterpart } from '@/v2019C1/extensions/lifecycle/layers/topology'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/** What one instance of the application holds: its own functions and the levels it lives on. */
export async function resolveInstanceHoldings(
	query: Core.Query<Config>,
	params: ResolveInstanceHoldingsParams,
): Promise<InstanceHoldings> {
	const { sourceQuery, applicationRef, instance, functionRefs, heldFunctions } = params

	// what tells the functions of this instance from another instance's: its references
	const instanceScope = await collectInstanceScope(query, instance)

	const ownedFunctions = new Map<string, AnyTrackedRecord[]>()
	const counterparts: InstanceCounterpart[] = []
	for (const functionRef of functionRefs) {
		const held = heldFunctions.get(functionRef.id) ?? []
		const owned = held.filter((candidate) => instanceScope.has(candidate.id))
		ownedFunctions.set(functionRef.id, owned)
		for (const ownedFunction of owned) {
			counterparts.push({
				source: functionRef,
				instance: { tagName: 'Function', id: ownedFunction.id } as Scl.Ref<Scl.ElementsOf>,
			})
		}
	}
	// its functions say where it lives; the application itself, for the levels they do not tell
	counterparts.push({
		source: applicationRef,
		instance: { tagName: 'Application', id: instance.id } as Scl.Ref<Scl.ElementsOf>,
	})

	const heldLevels = await resolveHeldLevels(query, { sourceQuery, counterparts })
	return { ownedFunctions, heldLevels }
}
