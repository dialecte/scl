import type { PresentationScope } from './presentation-scope.types'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'

/**
 * Where to root the structural tree of a lifecycle merge (FSD, ASD, SSD or IED) and which top-level sections to omit
 * or include beside it, for the verb of the merge.
 *
 * The Function (FSD) and Application (ASD) layers live inside the `Substation`
 * structure, so the tree roots there. `DataTypeTemplates` is a sibling of `Substation`
 * that every layer references (the types its LNodes/DOs instantiate), so it is
 * `include`d alongside the rooted subtree — the consumer snapshots it from the `SCL`
 * root and appends it. `Communication` and `IED` are out of scope of these layers;
 * rooting at `Substation` already excludes them (`omit` is belt-and-braces for a
 * consumer that roots at `SCL`).
 *
 * An IED reaches past its own element (its data types, its communication, the functions its logical nodes
 * implement), so its merge roots at `SCL` and shows the whole document.
 *
 * @intent show a lifecycle merge as a tree, which part of the document a merge review displays, root and sections of a merge view
 */
export function presentationScope(target: Pick<LifecycleTarget, 'verb'>): PresentationScope {
	switch (target.verb) {
		case 'fsd':
		case 'asd':
		case 'ssd':
			return {
				rootTag: 'Substation',
				omit: ['Communication', 'IED'],
				include: ['DataTypeTemplates'],
			}
		case 'ied':
			return { rootTag: 'SCL', omit: [], include: [] }
	}
}
