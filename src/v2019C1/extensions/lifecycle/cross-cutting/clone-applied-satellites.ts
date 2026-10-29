import { resolveAppliedSatellites } from './applied-satellites'

import { toRef } from '@dialecte/core/helpers'

import { placeUniquely } from '@/v2019C1/extensions/lifecycle/constraints'
import { leaveOutOfScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope'
import {
	cloneTree,
	resolveStructureRef,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'
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
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * Places the external CROSS-CUTTING satellites (e.g. `Variable`,
 * `BehaviorDescription`) that apply to any element in the primary subtree, or in what it composes (`composedRefs`) —
 * for a topology frame, those its levels hold too (`frame`) —,
 * but those the operation placed already (`alreadyCloned`) and what applies only to what it composes and does not place
 * (`notPlaced`). Tag-agnostic: whatever
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
	const { sourceQuery, primaryRef, composedRefs, alreadyCloned, structure, leftOut } = params
	const { bumpsCollisions, scope, notPlaced } = params

	const satellites =
		params.satelliteRefs ??
		(await resolveAppliedSatellites(sourceQuery, {
			primaryRef,
			composedRefs,
			leftOut: notPlaced ? new Set([...(leftOut ?? []), ...notPlaced]) : leftOut,
			frame: params.frame !== undefined,
		}))

	// one an element of the frame holds goes where that element landed, as the file holds it — first: in a file the
	// operation makes it keeps its name —; another at its structural level, numbered beside a sibling of its name
	const landings = params.frame ? indexFrameLandings(params.frame) : undefined
	const placements: SatellitePlacement[] = []
	for (const satelliteRef of satellites) {
		// one the application refers to is placed with it already
		if (alreadyCloned?.has(satelliteRef.id ?? '')) continue
		const holder = await readHolder(sourceQuery, { satelliteRef })
		const holderLanding = landings && holder ? findHolderLanding({ holder, landings }) : undefined
		const targetParent =
			holderLanding ?? (await resolveStructureRef(sourceQuery, satelliteRef, structure))
		placements.push({
			satelliteRef,
			holderTag: holder?.tagName,
			targetParent,
			landed: Boolean(holderLanding),
		})
	}
	placements.sort(function landedFirst(first, second) {
		return Number(second.landed) - Number(first.landed)
	})

	const cloneMappings: Scl.CloneMapping[] = []
	const moved: MovedSatellite[] = []
	const renamed: RenamedSatellite[] = []
	for (const { satelliteRef, holderTag, targetParent, landed } of placements) {
		const leaveOut = await leaveOutOfScope(sourceQuery, { root: satelliteRef, scope, leftOut })
		const clone = await cloneTree(tx, {
			sourceQuery,
			ref: satelliteRef,
			targetParent,
			leaveOut,
		})
		if (!clone) continue
		cloneMappings.push(...clone.mappings)
		const element = toRef(clone.record) as Scl.Ref<Scl.ElementsOf>
		// placed elsewhere than its holder's copy, on another kind of element or without its holder: moved
		if (!landed && (landings !== undefined || holderTag !== targetParent.tagName)) {
			moved.push({ element, from: holderTag ?? '', to: targetParent.tagName })
		}
		if (!bumpsCollisions) continue
		const name = (await tx.getAttribute(element, { name: 'name' })) ?? ''
		await placeUniquely(tx, { ref: element, parentRef: targetParent })
		const placedAs = (await tx.getAttribute(element, { name: 'name' })) ?? ''
		if (placedAs !== name) renamed.push({ element, name, as: placedAs })
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

/** The element holding a satellite: the parent of its `Private`, walked up record by record. */
async function readHolder(
	sourceQuery: Core.Query<Config>,
	params: { satelliteRef: Scl.Ref<Scl.ElementsOf> },
): Promise<AnyTrackedRecord | undefined> {
	const satellite = await sourceQuery.any.getRecord(params.satelliteRef)
	let holder = satellite?.parent ? await sourceQuery.any.getRecord(satellite.parent) : undefined
	while (holder?.tagName === 'Private') {
		holder = holder.parent ? await sourceQuery.any.getRecord(holder.parent) : undefined
	}
	return holder
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

/** The source records clone mappings copy (record ids): what an operation placed already. */
export function collectClonedIds(params: {
	cloneMappings: readonly Scl.CloneMapping[]
}): Set<string> {
	const cloned = new Set<string>()
	for (const mapping of params.cloneMappings) {
		if (mapping.source.id) cloned.add(mapping.source.id)
	}
	return cloned
}
