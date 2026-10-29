import { readSatelliteIndex } from './applied-satellites'
import { NO_HELD_APPLICATIONS } from './held-applications.constants'

import { readAttribute } from '@/v2019C1/helpers'

import type { AppliedSatellite, IndexedSatellite, SatelliteIndex } from './applied-satellites.types'
import type { DuplicateApplications, HeldApplications } from './held-applications.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * The project's satellites of a lineage by what they apply to (`byTarget`, by a project element's uuid: the copies
 * applying to it with their lineage), and the project element each landing names (`landed`). One read of the project's
 * satellites, and one of the elements the landings name; read before the placement writes anything.
 */
export async function readHeldApplications(params: {
	landings: readonly RedirectMapping[]
	projectQuery: Core.Query<Config>
	matchKey: MatchKey
}): Promise<HeldApplications> {
	const { landings, projectQuery, matchKey } = params
	if (landings.length === 0) return NO_HELD_APPLICATIONS
	const landed = new Map<string, string>()
	const byTarget = new Map<string, { lineage: string; copy: Scl.Ref<Scl.ElementsOf> }[]>()
	const targets = await projectQuery.any.getRecords(
		landings.map(function targetOf(landing) {
			return landing.target
		}),
	)
	landings.forEach(function landOn(landing, position) {
		// a landing names an element the project holds
		const record = targets[position] as AnyTrackedRecord
		const uuid = readAttribute({ record, name: 'uuid', defaults: 'none' })
		if (uuid) landed.set(landing.sourceUuid, uuid)
	})
	const projectIndex = await readSatelliteIndex(projectQuery)
	for (const copy of projectIndex.values()) {
		for (const reference of copy.references) {
			for (const named of reference.names) {
				const entries = byTarget.get(named.uuid) ?? []
				entries.push({ lineage: copy[matchKey], copy: copy.satelliteRef })
				byTarget.set(named.uuid, entries)
			}
		}
	}
	return { landed, byTarget, projectIndex }
}

/**
 * The applications of a variable the project's copy of it (or of a satellite of its template reference) already makes:
 * each reference naming, by uuid, an element of the template that lands on a project element such a copy applies to —
 * two applications of one variable never apply to one value. What a role refers to, what a function or a frame carries:
 * one rule.
 */
export function findDuplicateApplications(params: {
	satellite: Pick<IndexedSatellite, 'satelliteRef' | 'lineages' | 'references'>
	held: HeldApplications
}): DuplicateApplications {
	const { satellite, held } = params
	const referenceIds = new Set<string>()
	let copy: Scl.Ref<Scl.ElementsOf> | undefined
	// a behaviour description reads what its references name, applying to none of it: two of one lineage reading one
	// logical node the placement lands on are no duplicate
	if (satellite.satelliteRef.tagName !== 'Variable') return { referenceIds, copy }
	const lineages = new Set(satellite.lineages)
	for (const reference of satellite.references) {
		const copies = reference.names.flatMap(function heldCopies(named) {
			const target = held.landed.get(named.uuid)
			const entries = target ? (held.byTarget.get(target) ?? []) : []
			return entries.filter(function ofLineage(entry) {
				return lineages.has(entry.lineage)
			})
		})
		if (copies.length === 0) continue
		referenceIds.add(reference.id)
		copy = copy ?? copies[0].copy
	}
	return { referenceIds, copy }
}

/**
 * The applications of the satellites a placement applies that the project's copies make already (reference record ids),
 * by {@link findDuplicateApplications}: left out of what is written and listed. Such a satellite applies to what the
 * placement places too, which no copy applies to yet: it is placed still.
 */
export function collectDuplicateApplications(params: {
	satellites: readonly Pick<AppliedSatellite, 'satelliteRef'>[]
	/** The satellites of the template, as `readSatelliteIndex` reads them. */
	index: SatelliteIndex
	held: HeldApplications
}): Set<string> {
	const { satellites, index, held } = params
	const referenceIds = new Set<string>()
	for (const { satelliteRef } of satellites) {
		// every satellite of the template is indexed
		const satellite = index.get(satelliteRef.id ?? '') as IndexedSatellite
		for (const id of findDuplicateApplications({ satellite, held }).referenceIds)
			referenceIds.add(id)
	}
	return referenceIds
}
