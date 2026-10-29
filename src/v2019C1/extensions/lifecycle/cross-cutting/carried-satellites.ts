import { CROSS_CUTTING_SATELLITE_TAGS } from './applied-satellites.constants'
import { findDuplicateApplications } from './held-applications'

import { collectOutOfScopeReferences } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope'

import type { IndexedSatellite, SatelliteIndex } from './applied-satellites.types'
import type { CarriedScoping } from './carried-satellites.types'
import type { DuplicateApplications, HeldApplications } from './held-applications.types'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * What a placement places with another clone than an application's — what the functions it places carry (`trees`), what
 * a frame places of what its levels hold (`satellites`) —, scoped as what a role refers to is: the references naming
 * what the placement neither places nor lands on are left out, and those making an application the project's copy makes
 * already (`held`); a variable left applying to nothing is not placed at all (`notPlaced`), with what it holds, but the
 * project's copy stands for it when there is one (`copies`). Read from what the caller read already, nothing more.
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
	const scoping: CarriedScoping = { leaveOut: new Set(), notPlaced: new Set(), copies: new Map() }
	for (const tree of trees) collectCarried({ node: tree, scope, index, held, scoping })
	for (const satellite of params.satellites ?? []) {
		const outOfScope = new Set(
			satellite.references
				.filter(function namesOutside(reference) {
					return reference.names.some(function isOutside(named) {
						return !scope.has(named.uuid)
					})
				})
				.map(readReferenceId),
		)
		scopeSatellite({
			satelliteId: satellite.satelliteRef.id ?? '',
			tagName: satellite.satelliteRef.tagName,
			// what a variable holds of the references is its applications: the schema gives it no other
			applications: satellite.references.map(readReferenceId),
			outOfScope,
			duplicate: findDuplicateApplications({ satellite, held }),
			scoping,
		})
	}
	return scoping
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
			collectCarried({ ...params, node: child })
			continue
		}
		// every satellite of the template is indexed
		const indexed = index.get(child.id) as IndexedSatellite
		scopeSatellite({
			satelliteId: child.id,
			tagName: child.tagName,
			applications: child.tree.filter(isApplication).map(readReferenceId),
			outOfScope: collectOutOfScopeReferences({ tree: child, scope }),
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
	outOfScope: ReadonlySet<string>
	duplicate: DuplicateApplications
	scoping: CarriedScoping
}): void {
	const { satelliteId, outOfScope, duplicate, scoping } = params
	// a variable applies to something, or it is no variable
	const appliesToNothing =
		params.tagName === 'Variable' &&
		params.applications.every(function isLeftOut(id) {
			return outOfScope.has(id) || duplicate.referenceIds.has(id)
		})
	if (!appliesToNothing) {
		for (const id of [...outOfScope, ...duplicate.referenceIds]) scoping.leaveOut.add(id)
		return
	}
	scoping.notPlaced.add(satelliteId)
	scoping.leaveOut.add(satelliteId)
	if (duplicate.copy) scoping.copies.set(satelliteId, duplicate.copy)
}

function isApplication(reference: { tagName: string }): boolean {
	return reference.tagName === 'VariableApplyTo'
}

function readReferenceId(reference: { id: string }): string {
	return reference.id
}
