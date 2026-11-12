import type { SatelliteIndex } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites.types'
import type { CarriedScoping } from '@/v2019C1/extensions/lifecycle/cross-cutting/carried-satellites.types'
import type { HeldApplications } from '@/v2019C1/extensions/lifecycle/cross-cutting/held-applications.types'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'

/**
 * One first placement a report lists (a unit of a substation template with what it places, an application with the
 * functions it composes): what the references of its satellites may name, what it places; and what it listed already
 * (source record ids) — the apply places each once, so each is listed once, with the first primary it goes with.
 */
export type PlacementListing = {
	scope: ContributionScope
	/** The satellites listed, each with the first primary it applies to. */
	satellites: Set<string>
	/** The functions listed, each with the first application composing it. */
	functions: Set<string>
	/**
	 * The satellites applying to a primary the placement places (record ids): one an application's role refers to is
	 * listed with the first primary it applies to, not through the role — skipping the application leaves it to that
	 * primary.
	 */
	appliedToPrimaries: ReadonlySet<string>
	/**
	 * What its topology frame places (record ids): what applies to the frame, what its levels hold applying within it.
	 * One an application's role refers to is the frame's, not the application's — the role adds a dependency only.
	 */
	framed: ReadonlySet<string>
	/** What the functions it places and its frame carry, scoped as the apply clones them: see `scopeCarriedSatellites`. */
	carried: CarriedScoping
	/** What the project holds applying to what it lands on: see `readHeldApplications`. */
	held: HeldApplications
	/** Where the levels of the template land on elements the project holds, by source uuid, as the apply reads them. */
	landings: readonly RedirectMapping[]
	/** The satellites of the template, read once for the report of the placement. */
	index: SatelliteIndex
	/** The source elements the placement leaves out (record ids): nothing applying to them alone is listed. */
	leftOut?: ReadonlySet<string>
}
