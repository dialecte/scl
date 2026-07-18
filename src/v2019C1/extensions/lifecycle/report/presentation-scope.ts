import type { PresentationScope } from './presentation-scope.types'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'

/**
 * Layer-scoped presentation descriptor, derived from the verb.
 *
 * The Function (FSD) and Application (ASD) layers live inside the `Substation`
 * structure. `DataTypeTemplates` is always noise for a structural view; `IED` and
 * `Communication` are out of scope until the IED layer lands. Rooting at
 * `Substation` already excludes them; `omit` is the belt-and-braces list for a
 * consumer that chooses to root at `SCL` instead.
 */
export function presentationScope(target: Pick<LifecycleTarget, 'verb'>): PresentationScope {
	switch (target.verb) {
		case 'fsd':
		case 'asd':
			return { rootTag: 'Substation', omit: ['DataTypeTemplates', 'Communication', 'IED'] }
	}
}
