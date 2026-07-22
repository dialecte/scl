import type { PresentationScope } from './presentation-scope.types'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'

/**
 * Layer-scoped presentation descriptor, derived from the verb.
 *
 * The Function (FSD) and Application (ASD) layers live inside the `Substation`
 * structure, so the tree roots there. `DataTypeTemplates` is a sibling of `Substation`
 * that every layer references (the types its LNodes/DOs instantiate), so it is
 * `include`d alongside the rooted subtree — the consumer snapshots it from the `SCL`
 * root and appends it. `Communication` and `IED` remain out of scope until the IED
 * layer lands; rooting at `Substation` already excludes them (`omit` is belt-and-braces
 * for a consumer that roots at `SCL`).
 */
export function presentationScope(target: Pick<LifecycleTarget, 'verb'>): PresentationScope {
	switch (target.verb) {
		case 'fsd':
		case 'asd':
			return {
				rootTag: 'Substation',
				omit: ['Communication', 'IED'],
				include: ['DataTypeTemplates'],
			}
	}
}
