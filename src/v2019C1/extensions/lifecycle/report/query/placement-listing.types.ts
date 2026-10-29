import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'

/**
 * One first placement a report lists (a unit of a substation template with what it places, an application with the
 * functions it composes): what the references of its satellites may name, what it places; and what it listed already
 * (source record ids) — the apply places each once, so each is listed once, with the first primary it goes with.
 */
export type PlacementListing = {
	scope: ContributionScope
	/** The satellites listed, each with the first primary it applies to. */
	satellites: Set<string>
}
