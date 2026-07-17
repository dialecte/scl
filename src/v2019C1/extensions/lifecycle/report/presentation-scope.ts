import type { LifecycleTarget } from './seam.types'
import type { Scl } from '@/v2019C1/config'

/**
 * How to present a lifecycle merge as a structural tree: where to root it and
 * which top-level SCL sections are irrelevant to the layer.
 */
export type PresentationScope = {
	/** Element tag to root the structural tree at (the anchor's nearest ancestor of this tag). */
	rootTag: Scl.ElementsOf
	/** Sections never shown for this layer — used when a consumer roots higher (at `SCL`). */
	omit: Scl.ElementsOf[]
}

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
