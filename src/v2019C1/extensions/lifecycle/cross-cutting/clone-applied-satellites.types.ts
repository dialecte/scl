import type { AppliedSatellite, SatelliteIndex } from './applied-satellites.types'
import type { CarriedScoping } from './carried-satellites.types'
import type { HeldApplications } from './held-applications.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'

export type CloneAppliedSatellitesParams = {
	sourceQuery: Core.Query<Config>
	primaryRef: Scl.Ref<Scl.ElementsOf>
	/** What travels with the primary (the functions an application composes): what applies to them is placed too. */
	composedRefs?: readonly Scl.Ref<Scl.ElementsOf>[]
	/**
	 * What it composes and does not place (record ids: a function stood on, another application placed it): nothing
	 * applying to it alone is placed, nor what it holds.
	 */
	notPlaced?: ReadonlySet<string>
	structure: TargetStructure
	/** The source elements the consumer left out (record ids): a satellite applying to them only is not placed. */
	leftOut?: ReadonlySet<string>
	/** A satellite placed beside a sibling of its name is numbered: the scenario tells placed elements apart. */
	bumpsCollisions: boolean
	/** The satellites, resolved already by the caller: nothing is resolved again. */
	satellites?: readonly AppliedSatellite[]
	/**
	 * What the caller scoped of them (see `scopeCarriedSatellites`): the references left out, and the variables left
	 * applying to nothing, not placed.
	 */
	carried?: CarriedScoping
	/** What the roles of the applications placed refer to: placed with the rest, each whole. */
	referenced?: ReferencedSatellites
	/** The satellites of the template, read once by the operation: see `readSatelliteIndex`. */
	index: SatelliteIndex
	/**
	 * What the project held, before the placement wrote anything, applying to what it lands on (see
	 * `readHeldApplications`): a satellite applying where the project's copy of it applies already does not apply there
	 * twice.
	 */
	held?: HeldApplications
	/** What a satellite's references may name: what the placement places. */
	scope: ContributionScope
	/**
	 * The primary is a topology frame: what its levels hold is placed too — resolved by the caller (`satellites`, see
	 * `resolveAppliedSatellites`) —, each in the element the one holding it landed on.
	 */
	frame?: FramePlacement
}

/** Where the elements of a topology frame landed: copied, or onto an element the project holds. */
export type FramePlacement = {
	cloneMappings: readonly Scl.CloneMapping[]
	redirectMappings: readonly RedirectMapping[]
}

export type CloneAppliedSatellitesResult = {
	/** Each source record that was cloned and the copy made of it. */
	cloneMappings: Scl.CloneMapping[]
	/** The copies placed on another kind of element than the one holding the source, or where it did not land. */
	moved: MovedSatellite[]
	/** The copies numbered beside a sibling of their name. */
	renamed: RenamedSatellite[]
}

/** A satellite placed elsewhere than in the copy of the element holding it: what its relative paths start from moved. */
export type MovedSatellite = { element: Scl.Ref<Scl.ElementsOf>; from: string; to: string }

/** A satellite numbered beside a sibling of its name: what names it by its name names another. */
export type RenamedSatellite = { element: Scl.Ref<Scl.ElementsOf>; name: string; as: string }

/** Where the elements of a frame landed: by source record id (copied), by source uuid (onto a project element). */
export type FrameLandings = {
	byId: ReadonlyMap<string, Scl.Ref<Scl.ElementsOf>>
	byUuid: ReadonlyMap<string, Scl.Ref<Scl.ElementsOf>>
}

/** Where one satellite goes: the element holding it in the source, the target parent, whether its holder landed there. */
export type SatellitePlacement = {
	satelliteRef: Scl.Ref<Scl.ElementsOf>
	holderTag: string | undefined
	targetParent: Scl.Ref<Scl.ElementsOf>
	landed: boolean
	/** The references it is written without, when the caller read them already (one a role refers to). */
	leaveOut: ReadonlySet<string> | undefined
}

/**
 * What the roles of an application refer to (a variable, a behaviour description), each placed whole: the satellites,
 * and the references below them that name what the placement neither places nor lands on (record ids), left out.
 */
export type ReferencedSatellites = {
	satelliteRefs: readonly Scl.Ref<Scl.ElementsOf>[]
	leaveOut: ReadonlySet<string>
}
