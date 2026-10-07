import type { PlacementLevel } from './resolve-placement-mappings.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { OmitEntry } from '@dialecte/core'

export type EnsureTopologyFrameParams = {
	sourceQuery: Core.Query<Config>
	/** The instantiable root of the source frame (Substation / VoltageLevel / Bay). */
	scopeRef: Scl.Ref<Scl.ElementsOf>
	/** The target element the reproduced frame is rooted under (typically the SCL root). */
	targetParent: Scl.Ref<Scl.ElementsOf>
	/** Extra child tags to drop from the frame's own-content clones (e.g. extract prunes provenance). */
	omit?: OmitEntry<Config>[]
	/**
	 * Where each structural level lands, as resolved for a placement. Absent: the levels above the
	 * scope root are those of `targetParent` where it has them, every other level is created.
	 */
	placementLevels?: readonly PlacementLevel[]
	/**
	 * The source elements the consumer left out (record ids): such a level, or such an element a
	 * level holds, is not written — nor, for the unit, the levels above it.
	 */
	leftOut?: ReadonlySet<string>
}

export type EnsureTopologyFrameResult = {
	/** The scope root's own structural chain (Substation/VL/Bay), for single-scope placement compat. */
	structure: TargetStructure
	/** Source structural element id -> its reproduced target ref (multi-bay-safe placement). */
	frameIndex: Map<string, Scl.Ref<Scl.ElementsOf>>
	/** Source -> target mappings for every reproduced structural element and its own-content clones. */
	cloneMappings: Scl.CloneMapping[]
	/**
	 * The source elements that landed on an element the target already holds — a level, or what a
	 * level holds: a reference to such a source element is a reference to that target element.
	 */
	redirectMappings: RedirectMapping[]
}
