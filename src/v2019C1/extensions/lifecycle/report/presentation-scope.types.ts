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
