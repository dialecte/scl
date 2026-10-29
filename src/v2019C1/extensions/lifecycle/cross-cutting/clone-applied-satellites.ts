import { findHeldSatelliteIds, resolveAppliedSatelliteTargets } from './applied-satellites'
import { collectDuplicateApplications } from './held-applications'

import { toRef } from '@dialecte/core/helpers'

import { TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'
import { placeUniquely } from '@/v2019C1/extensions/lifecycle/constraints'
import { collectOutOfScopeReferences } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope'
import { cloneTree } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { readAttribute } from '@/v2019C1/helpers'

import type {
	CloneAppliedSatellitesParams,
	CloneAppliedSatellitesResult,
	FrameLandings,
	FramePlacement,
	MovedSatellite,
	RenamedSatellite,
	SatellitePlacement,
} from './clone-applied-satellites.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * Places the external CROSS-CUTTING satellites (e.g. `Variable`,
 * `BehaviorDescription`) that apply to any element in the primary subtree, or in what it composes (`composedRefs`) —
 * for a topology frame, those its levels hold too (`frame`) —, and what the roles of the applications placed refer to
 * (`referenced`), but what applies only to what it composes and does not place (`notPlaced`). Tag-agnostic: whatever
 * `resolveAppliedSatellites` returns is placed by its own tag. Satellites living
 * inside the subtree are cloned by `deep`, not here (the resolver excludes them).
 *
 * Each belongs to the instance placed: it is cloned at its source structural level — one an element of a frame holds,
 * where that element landed —, never mapped onto nor merged into an element of its name the project holds, applying
 * only to what the placement places (`scope`). When the operation tells placed elements
 * apart (`bumpsCollisions`), a name one of its siblings carries is numbered.
 *
 * UUID remapping is the caller's responsibility via `reference.applyUuidRemap`, over the returned
 * clone mappings; the caller stamps lineage via `writeIdentity`.
 */
export async function cloneAppliedSatellites(
	tx: Core.Transaction<Config>,
	params: CloneAppliedSatellitesParams,
): Promise<CloneAppliedSatellitesResult> {
	const { sourceQuery, primaryRef, composedRefs, structure, leftOut } = params
	const { bumpsCollisions, scope, notPlaced } = params

	const { index } = params
	const resolved =
		params.satellites ??
		(await resolveAppliedSatelliteTargets(sourceQuery, {
			primaryRef,
			composedRefs,
			leftOut: notPlaced ? new Set([...(leftOut ?? []), ...notPlaced]) : leftOut,
			index,
			scope,
		}))
	// what a role refers to is placed whole, its references left out as the roles' rule says; once, when it applies to
	// what is placed too
	const referenced = params.referenced?.satelliteRefs ?? []
	const referencedLeaveOut = params.referenced?.leaveOut
	const referencedIds = new Set(referenced.map(readRecordId))
	// one its scoping leaves applying to nothing is not placed
	const applied = resolved.filter(function isPlaced(satellite) {
		const satelliteId = readRecordId(satellite.satelliteRef)
		return !referencedIds.has(satelliteId) && !params.carried?.notPlaced.has(satelliteId)
	})
	// one the project holds by its uuid already is not placed again
	const held = await findHeldSatelliteIds(tx, { satellites: applied })
	// one applying where the project's copy of it applies already does not apply there twice
	const duplicates = params.held
		? collectDuplicateApplications({ satellites: applied, index, held: params.held })
		: undefined
	const satellites = [
		...referenced,
		...applied
			.filter(function isNotHeld(satellite) {
				return !held.has(readRecordId(satellite.satelliteRef))
			})
			.map(function satelliteOf(satellite) {
				return satellite.satelliteRef
			}),
	]

	// one an element of the frame holds goes where that element landed, as the file holds it — first: in a file the
	// operation makes it keeps its name —; another at its structural level, numbered beside a sibling of its name
	const landings = params.frame ? indexFrameLandings(params.frame) : undefined
	const placements: SatellitePlacement[] = []
	for (const satelliteRef of satellites) {
		// one read: the element holding it (the parent of its Private) and its structural level
		const ancestors = await sourceQuery.findAncestors(satelliteRef, { stopAtTagName: 'Substation' })
		const holder = ancestors.find(function isHolder(ancestor) {
			return ancestor.tagName !== 'Private'
		})
		const holderLanding = landings && holder ? findHolderLanding({ holder, landings }) : undefined
		const targetParent = holderLanding ?? readStructureLevel({ ancestors, structure })
		placements.push({
			satelliteRef,
			holderTag: holder?.tagName,
			targetParent,
			landed: Boolean(holderLanding),
			leaveOut: referencedIds.has(readRecordId(satelliteRef)) ? referencedLeaveOut : undefined,
		})
	}
	placements.sort(function landedFirst(first, second) {
		return Number(second.landed) - Number(first.landed)
	})

	const cloneMappings: Scl.CloneMapping[] = []
	const moved: MovedSatellite[] = []
	const renamed: RenamedSatellite[] = []
	for (const placement of placements) {
		const { satelliteRef, holderTag, targetParent, landed } = placement
		const clone = await cloneTree(tx, {
			sourceQuery,
			ref: satelliteRef,
			targetParent,
			// what its references name outside the scope, read from the tree the clone reads, and those making an
			// application the project's copy makes already
			leaveOutOf: function outOfScope(tree) {
				return (
					placement.leaveOut ??
					new Set([
						...(leftOut ?? []),
						...(params.carried?.leaveOut ?? []),
						...(duplicates ?? []),
						...collectOutOfScopeReferences({ tree, scope }),
					])
				)
			},
		})
		if (!clone) continue
		cloneMappings.push(...clone.mappings)
		const element = toRef(clone.record) as Scl.Ref<Scl.ElementsOf>
		// placed elsewhere than its holder's copy, on another kind of element or without its holder: moved
		if (!landed && (landings !== undefined || holderTag !== targetParent.tagName)) {
			moved.push({ element, from: holderTag ?? '', to: targetParent.tagName })
		}
		if (!bumpsCollisions) continue
		// a satellite is told apart from its siblings by its name: the field numbered
		const placed = await placeUniquely(tx, { ref: element, parentRef: targetParent })
		if (placed.status === 'resolved') renamed.push({ element, name: placed.from, as: placed.to })
	}
	return { cloneMappings, moved, renamed }
}

/** Where the elements of a frame landed, by source record id (copied) and by source uuid (onto a project element). */
function indexFrameLandings(frame: FramePlacement): FrameLandings {
	const byId = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	for (const mapping of frame.cloneMappings) {
		if (mapping.source.id) byId.set(mapping.source.id, mapping.target)
	}
	const byUuid = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	for (const redirect of frame.redirectMappings) byUuid.set(redirect.sourceUuid, redirect.target)
	return { byId, byUuid }
}

/**
 * The level of the target structure a satellite's nearest structural ancestor maps onto, as `resolveStructureRef`; one
 * held outside the substations (a line, a process) goes to the outermost level of the structure.
 */
function readStructureLevel(params: {
	ancestors: readonly AnyTrackedRecord[]
	structure: TargetStructure
}): Scl.Ref<Scl.ElementsOf> {
	const { ancestors, structure } = params
	const level = ancestors.find(function isMapped(ancestor) {
		return ancestor.tagName in structure
	})
	const outermost = TOPOLOGY_STRUCTURAL_TAGS.map(function levelOf(tagName) {
		return structure[tagName]
	}).find(Boolean)
	const target = level ? structure[level.tagName as keyof TargetStructure] : outermost
	return toRef(target as AnyTrackedRecord) as Scl.Ref<Scl.ElementsOf>
}

/** Where the element holding a satellite landed, when the frame placed it. */
function findHolderLanding(params: {
	holder: AnyTrackedRecord
	landings: FrameLandings
}): Scl.Ref<Scl.ElementsOf> | undefined {
	const { holder, landings } = params
	const uuid = readAttribute({ record: holder, name: 'uuid', defaults: 'none' })
	return landings.byId.get(holder.id) ?? (uuid ? landings.byUuid.get(uuid) : undefined)
}

/** The record id of a stored element's ref. */
function readRecordId(ref: Scl.Ref<Scl.ElementsOf>): string {
	return ref.id ?? ''
}
