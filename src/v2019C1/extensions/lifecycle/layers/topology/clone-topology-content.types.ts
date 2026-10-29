import type { UnitPlacement } from './scope-content.types'
import type { Scl } from '@/v2019C1/config'
import type {
	AppliedSatellite,
	SatelliteIndex,
} from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites.types'
import type { CarriedScoping } from '@/v2019C1/extensions/lifecycle/cross-cutting/carried-satellites.types'
import type { ReferencedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/clone-applied-satellites.types'
import type { HeldApplications } from '@/v2019C1/extensions/lifecycle/cross-cutting/held-applications.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'

export type CloneTopologyContentResult = {
	/** All source -> target clone mappings for the gathered content (frame + fn/app). */
	cloneMappings: Scl.CloneMapping[]
	/**
	 * Source refs of the top-level placed elements (Applications, their composed Functions,
	 * standalone Functions) - the elements a caller runs placement-collision on. The structural
	 * frame is placed by merge-by-name, so it is not included here.
	 */
	placedRoots: Scl.Ref<Scl.ElementsOf>[]
	/** Source structural element id -> reproduced target ref, for name-correct placement. */
	frameIndex: Map<string, Scl.Ref<Scl.ElementsOf>>
	/** Shared elements mapped onto elements the target already holds (nothing cloned for them). */
	redirectMappings: RedirectMapping[]
	/** What the unit places beyond its subtree, and what the references of what travels with it may name. */
	unit: UnitPlacement
	/** What the roles of its applications refer to: the caller places it with what applies to the unit. */
	referenced: ReferencedSatellites
	/** The same, by the application whose roles refer to it (record id). */
	referencedBy: ReadonlyMap<string, readonly Scl.Ref<Scl.ElementsOf>[]>
	/** What the roles of its applications refer to that is not placed, nor the reference to it. */
	satellitesNotPlaced: Scl.Ref<Scl.ElementsOf>[]
	/** The satellites of the template, read once: for the caller placing what applies to the unit. */
	index: SatelliteIndex
	/** What the caller places with the frame: what applies to the unit, what its levels hold (see `resolveAppliedSatellites`). */
	satellites: AppliedSatellite[]
	/** What the frame and the functions of the unit carry, scoped: see `scopeCarriedSatellites`. */
	carried: CarriedScoping
	/** What the project held, before anything was written, applying to what the placement lands on. */
	held: HeldApplications
}
