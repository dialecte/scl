import {
	readSatelliteIndex,
	resolveAppliedSatelliteTargets,
} from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites'
import { CROSS_CUTTING_SATELLITE_TAGS } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites.constants'
import { scopeCarriedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/carried-satellites'
import { NO_HELD_APPLICATIONS } from '@/v2019C1/extensions/lifecycle/cross-cutting/held-applications.constants'
import { readAttribute } from '@/v2019C1/helpers'

import type { PlacementListing } from './placement-listing.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { IndexedSatellite } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites.types'
import type { HeldApplications } from '@/v2019C1/extensions/lifecycle/cross-cutting/held-applications.types'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * The listing of a first placement, nothing listed yet but what its primaries hold: a satellite inside a function or an
 * application it places is listed with that primary's own content, as its clone carries it.
 */
export async function createPlacementListing(
	sourceQuery: Core.Query<Config>,
	params: {
		/** What the references of its satellites may name. */
		scope: ContributionScope
		/** The primaries it places: its applications and functions. */
		primaryRefs: readonly Scl.Ref<Scl.ElementsOf>[]
		leftOut?: ReadonlySet<string>
		/** The functions among them the placement stands on (record ids): what applies to them no primary lists. */
		stoodOnIds?: ReadonlySet<string>
		/** What the project holds applying to what it lands on: see `readHeldApplications`. Default: nothing. */
		held?: HeldApplications
		/** Where the levels of the template land on elements the project holds, by source uuid. */
		landings: readonly RedirectMapping[]
		/** The topology frame it places (the unit of a substation template), with the functions the unit composes. */
		frame?: {
			primaryRef: Scl.Ref<Scl.ElementsOf>
			composedRefs: readonly Scl.Ref<Scl.ElementsOf>[]
		}
	},
): Promise<PlacementListing> {
	const { scope, primaryRefs, leftOut } = params
	const satellites = new Set<string>()
	const primaryUuids = new Set<string>()
	const functionTrees: AnyTreeRecord[] = []
	for (const primaryRef of primaryRefs) {
		const tree = await sourceQuery.any.getTree(primaryRef)
		if (!tree) continue
		collectSatellites({ node: tree, satellites })
		if (params.stoodOnIds?.has(tree.id)) continue
		collectUuids({ node: tree, uuids: primaryUuids })
		if (tree.tagName === 'Function') functionTrees.push(tree)
	}
	// the satellites of the template, read once for the whole report of the placement
	const index = await readSatelliteIndex(sourceQuery)
	const held = params.held ?? NO_HELD_APPLICATIONS
	// what the frame places of what applies to it and of what its levels hold, as its apply resolves it
	const framed = params.frame
		? await resolveAppliedSatelliteTargets(sourceQuery, {
				primaryRef: params.frame.primaryRef,
				composedRefs: params.frame.composedRefs,
				leftOut,
				frame: true,
				index,
				scope,
			})
		: []
	// what the functions it places and the frame carry, scoped as their clones are
	const carried = scopeCarriedSatellites({
		trees: functionTrees,
		satellites: framed.map(function indexedOf(satellite) {
			return index.get(satellite.satelliteRef.id ?? '') as IndexedSatellite
		}),
		scope,
		index,
		held,
	})
	// what applies to a primary placed
	const appliedToPrimaries = new Set<string>()
	for (const indexed of index.values()) {
		// as a function's report reads it: through a reference the placement does not leave out
		const named = indexed.references.flatMap(function namesOf(reference) {
			return leftOut?.has(reference.id) ? [] : reference.names
		})
		const appliesToPrimary = named.some(function isPrimaryContent(name) {
			return primaryUuids.has(name.uuid)
		})
		if (appliesToPrimary) appliedToPrimaries.add(indexed.satelliteRef.id ?? '')
	}
	return {
		scope,
		satellites,
		functions: new Set<string>(),
		appliedToPrimaries,
		framed: new Set(
			framed.map(function idOf(satellite) {
				return satellite.satelliteRef.id ?? ''
			}),
		),
		carried,
		held,
		landings: params.landings,
		index,
		leftOut,
	}
}

/** The uuids of a tree. */
function collectUuids(params: { node: AnyTreeRecord; uuids: Set<string> }): void {
	const { node, uuids } = params
	const uuid = readAttribute({ record: node, name: 'uuid', defaults: 'none' })
	if (uuid) uuids.add(uuid)
	for (const child of node.tree) collectUuids({ node: child, uuids })
}

/** The satellites below a node. */
function collectSatellites(params: { node: AnyTreeRecord; satellites: Set<string> }): void {
	const { node, satellites } = params
	for (const child of node.tree) {
		if (CROSS_CUTTING_SATELLITE_TAGS.has(child.tagName)) satellites.add(child.id)
		else collectSatellites({ node: child, satellites })
	}
}
