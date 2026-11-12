import { readSatelliteIndex } from './applied-satellites'
import { CROSS_CUTTING_SATELLITE_TAGS } from './applied-satellites.constants'
import { findDuplicateApplications } from './held-applications'
import { NO_HELD_APPLICATIONS } from './held-applications.constants'

import {
	collectContributionScope,
	collectReferencesOutsideScope,
	findUndeclaredNodeReference,
	idOfOutside,
} from '@/v2019C1/extensions/lifecycle/engine/contribution-scope'

import type { HeldReference, IndexedSatellite, SatelliteIndex } from './applied-satellites.types'
import type { CarriedScoping } from './carried-satellites.types'
import type { DuplicateApplications, HeldApplications } from './held-applications.types'
import type { Config, Scl } from '@/v2019C1/config'
import type {
	ContributionScope,
	ReferenceOutsideScope,
} from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * What a placement places with another clone than an application's — what the functions it places carry (`trees`), what
 * a frame places of what its levels hold (`satellites`) —, scoped as what a role refers to is: the references naming
 * what the placement neither places nor lands on are left out, and those making an application the project's copy makes
 * already (`held`); a variable left applying to nothing is not placed at all (`notPlaced`), with what it holds, but the
 * project's copy stands for it when there is one (`copies`). A reference left out of a satellite placed, naming what the
 * placement does not place, is told of (`referencesNotPlaced`). Read from what the caller read already, nothing more.
 */
export function scopeCarriedSatellites(params: {
	trees: readonly AnyTreeRecord[]
	/** What a frame places of what its levels hold, read from the satellites of the template. */
	satellites?: readonly IndexedSatellite[]
	scope: ContributionScope
	/** The satellites of the template: what a carried one is read in to tell its lineage. */
	index: SatelliteIndex
	/** What the project holds already applying to what the placement lands on: see `readHeldApplications`. */
	held: HeldApplications
}): CarriedScoping {
	const { trees, scope, index, held } = params
	const scoping: CarriedScoping = {
		leaveOut: new Set(),
		notPlaced: new Set(),
		copies: new Map(),
		referencesNotPlaced: [],
	}
	for (const tree of trees) collectCarried({ node: tree, scope, index, held, scoping })
	for (const satellite of params.satellites ?? []) {
		scopeSatellite({
			satelliteId: satellite.satelliteRef.id ?? '',
			tagName: satellite.satelliteRef.tagName,
			// what a variable holds of the references is its applications: the schema gives it no other
			applications: satellite.references.map(readReferenceId),
			outOfScope: findHeldReferencesOutside({ references: satellite.references, scope }),
			duplicate: findDuplicateApplications({ satellite, held }),
			scoping,
		})
	}
	return scoping
}

/**
 * What a function placed on its own carries, scoped as a larger placement scopes what its functions carry (see
 * `scopeCarriedSatellites`): what its references may name is the function, what it holds and the levels of the template
 * it lands on. One read of its tree.
 */
export async function scopeFunctionCarried(
	sourceQuery: Core.Query<Config>,
	params: {
		functionRef: Scl.Ref<Scl.ElementsOf>
		/** The levels of the template it lands on: a reference to one names where it landed. */
		landedLevels: readonly { uuid: string }[]
		/** The satellites of the template, when read already: see `readSatelliteIndex`. */
		index?: SatelliteIndex
	},
): Promise<CarriedScoping> {
	const tree = await sourceQuery.any.getTree(params.functionRef)
	const index = params.index ?? (await readSatelliteIndex(sourceQuery))
	const scope = new Set<string>(
		params.landedLevels.map(function uuidOf(level) {
			return level.uuid
		}),
	)
	if (tree) collectContributionScope({ node: tree, leftOut: undefined, scope })
	return scopeCarriedSatellites({
		trees: tree ? [tree] : [],
		scope,
		index,
		held: NO_HELD_APPLICATIONS,
	})
}

function collectCarried(params: {
	node: AnyTreeRecord
	scope: ContributionScope
	index: SatelliteIndex
	held: HeldApplications
	scoping: CarriedScoping
}): void {
	const { node, scope, index, held, scoping } = params
	for (const child of node.tree) {
		if (!CROSS_CUTTING_SATELLITE_TAGS.has(child.tagName)) {
			// a terminal of the function's equipment on a node the template does not hold: left out, told of
			const undeclared = findUndeclaredNodeReference({ reference: child })
			if (undeclared) {
				scoping.leaveOut.add(child.id)
				scoping.referencesNotPlaced.push({
					reference: { tagName: child.tagName, id: child.id },
					...undeclared,
				})
				continue
			}
			collectCarried({ ...params, node: child })
			continue
		}
		// every satellite of the template is indexed
		const indexed = index.get(child.id) as IndexedSatellite
		scopeSatellite({
			satelliteId: child.id,
			tagName: child.tagName,
			applications: child.tree.filter(isApplication).map(readReferenceId),
			outOfScope: collectReferencesOutsideScope({ tree: child, scope }),
			duplicate: findDuplicateApplications({ satellite: indexed, held }),
			scoping,
		})
	}
}

/** One satellite carried: what of it is left out, whether it is placed, the project's copy standing for it. */
function scopeSatellite(params: {
	satelliteId: string
	tagName: string
	/** Its applications (record ids): what a variable applies to. */
	applications: readonly string[]
	/** Its references naming what the placement neither places nor lands on. */
	outOfScope: readonly ReferenceOutsideScope[]
	duplicate: DuplicateApplications
	scoping: CarriedScoping
}): void {
	const { satelliteId, duplicate, scoping } = params
	const outOfScope = new Set(params.outOfScope.map(idOfOutside))
	// a variable applies to something, or it is no variable
	const appliesToNothing =
		params.tagName === 'Variable' &&
		params.applications.every(function isLeftOut(id) {
			return outOfScope.has(id) || duplicate.referenceIds.has(id)
		})
	if (!appliesToNothing) {
		for (const id of [...outOfScope, ...duplicate.referenceIds]) scoping.leaveOut.add(id)
		// placed without them: what they named is not placed, told of — an application the project's copy makes already
		// is made, not left out
		scoping.referencesNotPlaced.push(...params.outOfScope)
		return
	}
	scoping.notPlaced.add(satelliteId)
	scoping.leaveOut.add(satelliteId)
	// not placed for what it applies to is not placed: told of, reference by reference
	scoping.referencesNotPlaced.push(...params.outOfScope)
	if (duplicate.copy) scoping.copies.set(satelliteId, duplicate.copy)
}

/**
 * The references a satellite holds naming an element outside `scope`, each with the attribute naming it and the path
 * written: what a placement leaves out of it, and tells of when it places the satellite.
 */
export function findHeldReferencesOutside(params: {
	references: readonly HeldReference[]
	scope: ContributionScope
}): ReferenceOutsideScope[] {
	const { references, scope } = params
	return references.flatMap(function outsideOf(reference): ReferenceOutsideScope[] {
		const named = reference.names.find(function isOutside(name) {
			return !scope.has(name.uuid)
		})
		if (!named) return []
		const outside = {
			reference: { tagName: reference.tagName, id: reference.id },
			attribute: named.attribute,
		}
		return [named.path === undefined ? outside : { ...outside, path: named.path }]
	})
}

function isApplication(reference: { tagName: string }): boolean {
	return reference.tagName === 'VariableApplyTo'
}

function readReferenceId(reference: { id: string }): string {
	return reference.id
}
