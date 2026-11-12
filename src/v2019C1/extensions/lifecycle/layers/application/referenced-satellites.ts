import { toRef } from '@dialecte/core/helpers'

import {
	findHeldSatelliteIds,
	readSatelliteIndex,
} from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites'
import {
	CROSS_CUTTING_SATELLITE_TAGS,
	SATELLITE_REFERENCE_LINKS,
} from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites.constants'
import { findHeldReferencesOutside } from '@/v2019C1/extensions/lifecycle/cross-cutting/carried-satellites'
import { findDuplicateApplications } from '@/v2019C1/extensions/lifecycle/cross-cutting/held-applications'
import { NO_HELD_APPLICATIONS } from '@/v2019C1/extensions/lifecycle/cross-cutting/held-applications.constants'
import { idOfOutside } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope'
import { readAttribute } from '@/v2019C1/helpers'

import type {
	ReferencedSatellite,
	RoleSatellites,
	StoodOnFunction,
	StoodOnPair,
} from './referenced-satellites.types'
import type { Config, Scl } from '@/v2019C1/config'
import type {
	HeldReference,
	IndexedSatellite,
	SatelliteIndex,
} from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites.types'
import type { CarriedScoping } from '@/v2019C1/extensions/lifecycle/cross-cutting/carried-satellites.types'
import type { HeldApplications } from '@/v2019C1/extensions/lifecycle/cross-cutting/held-applications.types'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * The cross-cutting satellites an application's roles refer to (a variable, a behaviour description), each once, with
 * the references naming it. One living inside the application or a function it composes is placed with that clone: a
 * placement lists it there (`PlacementListing`).
 */
export async function resolveReferencedSatellites(
	query: Core.Query<Config>,
	params: {
		applicationRef: Scl.Ref<'Application'>
		/** The satellites of the document, read already: see `readSatelliteIndex`. */
		index?: SatelliteIndex
	},
): Promise<ReferencedSatellite[]> {
	const tree = await query.any.getTree(params.applicationRef)
	const references = new Map<string, { targets: readonly string[]; referenceIds: string[] }>()
	if (tree) collectSatelliteReferences({ node: tree, references })
	if (references.size === 0) return []

	// the satellites of the document, read once: those of a tag a reference names, by the uuid it names
	const index = params.index ?? (await readSatelliteIndex(query))
	const satellites: ReferencedSatellite[] = []
	for (const indexed of index.values()) {
		const named = references.get(indexed.uuid)
		if (!named?.targets.includes(indexed.satelliteRef.tagName)) continue
		satellites.push({ ...indexed, referenceIds: named.referenceIds })
	}
	return satellites
}

/**
 * What a placement does with what the roles of an application refer to (see `RoleSatellites`): each is placed whole,
 * its references naming what the placement places or lands on (`scope`), but those landing where the project's copy of it
 * applies already (`held`); a variable left applying to nothing is the project's copy when there is one, else not
 * placed, nor the references to it; one inside a function the application stands on, or applying to nothing but it, is
 * the copy the project holds; one another clone places (`carriedIds`) is left to it, scoped by the same rule (`carried`).
 */
export async function resolveRoleSatellites(
	sourceQuery: Core.Query<Config>,
	params: {
		applicationRef: Scl.Ref<'Application'>
		/** What the satellites' references may name: what the placement places or lands on. */
		scope: ContributionScope
		/** What the placement places with another clone (record ids: what the functions it places hold): left to it. */
		carriedIds: ReadonlySet<string>
		/** The functions the application stands on, and the elements of the project the copies are read in. */
		stoodOn: {
			functions: readonly StoodOnFunction[]
			projectQuery: Core.Query<Config>
			matchKey: MatchKey
		}
		/** The satellites of the template, read already by the operation: see `readSatelliteIndex`. */
		index?: SatelliteIndex
		/** What the placement carries with another clone, scoped: see `scopeCarriedSatellites`. */
		carried?: CarriedScoping
		/** What the project holds already applying to what the placement lands on: see `readHeldApplications`. */
		held?: HeldApplications
	},
): Promise<RoleSatellites> {
	const { applicationRef, scope, carriedIds } = params
	const index = params.index ?? (await readSatelliteIndex(sourceQuery))
	const referenced = await resolveReferencedSatellites(sourceQuery, { applicationRef, index })
	// what the project holds already of what lands on its elements: a copy applying to it is not written twice
	const held = params.held ?? NO_HELD_APPLICATIONS
	const stoodOn = await findStoodOnCopies(sourceQuery, {
		...params.stoodOn,
		referenced,
		index,
		projectIndex: held.projectIndex,
	})

	const satellites: RoleSatellites = {
		placed: [],
		placedUuids: new Map(),
		unplaced: [],
		unplacedReferenceIds: new Set(),
		leaveOut: new Set(),
		referencesNotPlaced: [],
		copies: [],
		copiedIds: new Set(),
	}
	for (const { satelliteRef, uuid, lineages, references, referenceIds } of referenced) {
		const satelliteId = satelliteRef.id ?? ''
		// inside a function stood on: the copy it holds, or nothing — the project's function is not given it
		if (stoodOn.inside.has(satelliteId)) {
			const copy = stoodOn.copies.get(satelliteId)
			if (copy) {
				satellites.copies.push({ sourceUuid: uuid, target: copy })
				satellites.copiedIds.add(satelliteId)
			} else {
				satellites.unplaced.push(satelliteRef)
				for (const referenceId of referenceIds) satellites.unplacedReferenceIds.add(referenceId)
			}
			continue
		}
		if (carriedIds.has(satelliteId)) {
			// placed with the clone carrying it, but one its scoping leaves applying to nothing: the project's copy standing
			// for it, else not placed, nor referred to
			const copy = params.carried?.copies.get(satelliteId)
			if (copy) {
				satellites.copies.push({ sourceUuid: uuid, target: copy })
				satellites.copiedIds.add(satelliteId)
			} else if (params.carried?.notPlaced.has(satelliteId)) {
				satellites.unplaced.push(satelliteRef)
				for (const referenceId of referenceIds) satellites.unplacedReferenceIds.add(referenceId)
			}
			continue
		}
		// the references it holds naming what the placement neither places nor lands on
		const outside = findHeldReferencesOutside({ references, scope })
		const outOfScope = new Set(outside.map(idOfOutside))
		// one application of a variable the project's copy of it (or of a template sibling) already makes is not made
		// twice: two VariableApplyTo never apply to one value
		const duplicate = findDuplicateApplications({
			satellite: { satelliteRef, lineages, references },
			held,
		})
		// a variable applies to something, or it is no variable: one whose every application (each reference it holds)
		// names nothing reached, or what the project's copy applies to already
		const appliesToNothing =
			satelliteRef.tagName === 'Variable' &&
			references.every(function isLeftOut(reference) {
				return outOfScope.has(reference.id) || duplicate.referenceIds.has(reference.id)
			})
		if (appliesToNothing && duplicate.copy) {
			// the project's copy is the one: the roles name it, nothing is written
			satellites.copies.push({ sourceUuid: uuid, target: duplicate.copy })
			satellites.copiedIds.add(satelliteId)
			continue
		}
		if (appliesToNothing) {
			satellites.unplaced.push(satelliteRef)
			for (const referenceId of referenceIds) satellites.unplacedReferenceIds.add(referenceId)
			continue
		}
		satellites.placed.push(satelliteRef)
		satellites.placedUuids.set(satelliteId, uuid)
		for (const id of [...outOfScope, ...duplicate.referenceIds]) satellites.leaveOut.add(id)
		// placed without them: what they named is not placed, told of
		satellites.referencesNotPlaced.push(...outside)
	}
	return satellites
}

/**
 * What a placement writes of what the roles refer to (`placed`): one the project already holds by its uuid is not placed
 * again — the report lists it not, the apply writes it not. One read per tag.
 */
export async function withoutHeldSatellites(
	projectQuery: Core.Query<Config>,
	params: { roleSatellites: RoleSatellites },
): Promise<Scl.Ref<Scl.ElementsOf>[]> {
	const { placed, placedUuids } = params.roleSatellites
	const held = await findHeldSatelliteIds(projectQuery, {
		satellites: placed.map(function withUuid(satelliteRef) {
			return { satelliteRef, uuid: placedUuids.get(satelliteRef.id ?? '') ?? '' }
		}),
	})
	return placed.filter(function isNotHeld(satelliteRef) {
		return !held.has(satelliteRef.id ?? '')
	})
}

/**
 * What the roles of an application refer to inside the functions it stands on, or applying to nothing but them
 * (`inside`, record ids), and the copy the project holds of each (`copies`): the element carrying the satellite's uuid, or
 * the uuid of a satellite of its template reference, as its lineage — inside the project's function for one the
 * function holds, applying to it for one applying to it only. A function stood on keeps one set of what applies to it.
 */
async function findStoodOnCopies(
	sourceQuery: Core.Query<Config>,
	params: {
		functions: readonly StoodOnFunction[]
		projectQuery: Core.Query<Config>
		matchKey: MatchKey
		referenced: readonly ReferencedSatellite[]
		index: SatelliteIndex
		/** The project's satellites, when read already with what it holds: see `readHeldApplications`. */
		projectIndex: SatelliteIndex | undefined
	},
): Promise<{ copies: Map<string, Scl.Ref<Scl.ElementsOf>>; inside: Set<string> }> {
	const { functions, projectQuery, matchKey, referenced, index } = params
	const copies = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	const insideIds = new Set<string>()
	if (functions.length === 0 || referenced.length === 0) return { copies, inside: insideIds }
	const referencedIds = new Set(
		referenced.map(function idOf(satellite) {
			return satellite.satelliteRef.id ?? ''
		}),
	)
	const sourceFunctions = await sourceQuery.any.findByAttributes({
		tagName: 'Function',
		attributes: {
			uuid: functions.map(function uuidOf(stoodOn) {
				return stoodOn.sourceUuid
			}),
		},
	})
	// one read per side and per function stood on: what the template's function holds, what the project's holds — a
	// copy is sought in the function the satellite's own function is stood on by, never in another
	const pairs: StoodOnPair[] = []
	for (const sourceFunction of sourceFunctions) {
		// read by the uuids of the functions stood on: each is one of them
		const uuid = readAttribute({ record: sourceFunction, name: 'uuid', defaults: 'none' })
		const stoodOn = functions.find(function standsFor(candidate) {
			return candidate.sourceUuid === uuid
		}) as StoodOnFunction
		const pair: StoodOnPair = {
			source: { uuids: new Set(), satellites: [] },
			project: { uuids: new Set(), satellites: [] },
		}
		const sourceTree = await sourceQuery.any.getTree(sourceFunction)
		const projectTree = await projectQuery.any.getTree(stoodOn.target)
		if (sourceTree) collectContent({ node: sourceTree, content: pair.source })
		if (projectTree) collectContent({ node: projectTree, content: pair.project })
		pairs.push(pair)
	}
	for (const pair of pairs) {
		// the copies the project's function holds, by lineage
		const heldCopies = new Map<string, Scl.Ref<Scl.ElementsOf>>()
		for (const copy of pair.project.satellites) {
			const lineage = readAttribute({ record: copy, name: matchKey, defaults: 'none' })
			if (lineage) heldCopies.set(lineage, toRef(copy) as Scl.Ref<Scl.ElementsOf>)
		}
		for (const satellite of pair.source.satellites) {
			if (!referencedIds.has(satellite.id)) continue
			insideIds.add(satellite.id)
			const copy = findCopy({ satelliteId: satellite.id, index, copies: heldCopies })
			if (copy) copies.set(satellite.id, copy)
		}
	}

	// one applying to nothing but the functions stood on: the copy applying to nothing but the project's functions those
	// are stood on by — one set applies to a function
	const sourceUuids = new Set(
		pairs.flatMap(function uuidsOf(pair) {
			return [...pair.source.uuids]
		}),
	)
	const applyingOnly = referenced.filter(function appliesOnlyToStoodOn(satellite) {
		return (
			!insideIds.has(satellite.satelliteRef.id ?? '') &&
			namesOnly({ references: satellite.references, uuids: sourceUuids })
		)
	})
	if (applyingOnly.length === 0) return { copies, inside: insideIds }
	const projectIndex = params.projectIndex ?? (await readSatelliteIndex(projectQuery))
	for (const satellite of applyingOnly) {
		const satelliteId = satellite.satelliteRef.id ?? ''
		insideIds.add(satelliteId)
		const named = new Set(
			satellite.references.flatMap(function uuidsOf(reference) {
				return reference.names.map(function uuidOf(name) {
					return name.uuid
				})
			}),
		)
		const projectUuids = new Set(
			pairs
				.filter(function isNamed(pair) {
					return [...pair.source.uuids].some(function namedHere(uuid) {
						return named.has(uuid)
					})
				})
				.flatMap(function uuidsOf(pair) {
					return [...pair.project.uuids]
				}),
		)
		const applyingCopies = new Map<string, Scl.Ref<Scl.ElementsOf>>()
		for (const copy of projectIndex.values()) {
			if (namesOnly({ references: copy.references, uuids: projectUuids }))
				applyingCopies.set(copy[matchKey], copy.satelliteRef)
		}
		const copy = findCopy({ satelliteId, index, copies: applyingCopies })
		if (copy) copies.set(satelliteId, copy)
	}
	return { copies, inside: insideIds }
}

/** The copy of a satellite among the copies by lineage: of it, or of a satellite of its template reference. */
function findCopy(params: {
	satelliteId: string
	index: SatelliteIndex
	copies: ReadonlyMap<string, Scl.Ref<Scl.ElementsOf>>
}): Scl.Ref<Scl.ElementsOf> | undefined {
	const { satelliteId, index, copies } = params
	return (index.get(satelliteId) as IndexedSatellite).lineages
		.map(function copyOf(lineage) {
			return copies.get(lineage)
		})
		.find(Boolean)
}

/** Whether every reference a satellite holds names, by uuid, something among `uuids` only. */
function namesOnly(params: {
	references: readonly HeldReference[]
	uuids: ReadonlySet<string>
}): boolean {
	const { references, uuids } = params
	// each reference names something by uuid (one by path names nothing known), and every uuid named is among them
	const named = references.every(function namesByUuid(reference) {
		return reference.names.length > 0
	})
	const names = references.flatMap(function namesOf(reference) {
		return reference.names
	})
	return (
		references.length > 0 &&
		named &&
		names.every(function isWithin(name) {
			return uuids.has(name.uuid)
		})
	)
}

/** The uuids of a tree and the satellites below it. */
function collectContent(params: {
	node: AnyTreeRecord
	content: { uuids: Set<string>; satellites: AnyTreeRecord[] }
}): void {
	const { node, content } = params
	const uuid = readAttribute({ record: node, name: 'uuid', defaults: 'none' })
	if (uuid) content.uuids.add(uuid)
	for (const child of node.tree) {
		if (CROSS_CUTTING_SATELLITE_TAGS.has(child.tagName)) content.satellites.push(child)
		collectContent({ node: child, content })
	}
}

/** The uuids the references to a satellite below a node name, with the satellite tags each names and the references. */
function collectSatelliteReferences(params: {
	node: AnyTreeRecord
	references: Map<string, { targets: readonly string[]; referenceIds: string[] }>
}): void {
	const { node, references } = params
	const link = SATELLITE_REFERENCE_LINKS.get(node.tagName)
	if (link) {
		// a reference naming no uuid names no satellite
		const uuid = readAttribute({ record: node, name: link.uuid, defaults: 'none' })
		const known = uuid ? references.get(uuid) : undefined
		if (known) known.referenceIds.push(node.id)
		else if (uuid) references.set(uuid, { targets: link.targets, referenceIds: [node.id] })
	}
	for (const child of node.tree) collectSatelliteReferences({ ...params, node: child })
}
