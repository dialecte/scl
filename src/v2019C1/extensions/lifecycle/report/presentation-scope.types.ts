import type { Scl } from '@/v2019C1/config'

/**
 * How to present a lifecycle merge as a structural tree: where to root it, which
 * top-level SCL sections are irrelevant to the layer, and which top-level sections
 * to include alongside the rooted subtree.
 */
export type PresentationScope = {
	/** Element tag to root the structural tree at (the anchor's nearest ancestor of this tag). */
	rootTag: Scl.ElementsOf
	/** Sections never shown for this layer — used when a consumer roots higher (at `SCL`). */
	omit: Scl.ElementsOf[]
	/**
	 * Top-level SCL sections to show alongside the rooted subtree, even though they live
	 * outside the `rootTag` (e.g. `DataTypeTemplates`, a sibling of `Substation`). The
	 * consumer snapshots each from the `SCL` root and appends it to the tree.
	 */
	include: Scl.ElementsOf[]
}
