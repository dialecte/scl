import { toRef } from '@dialecte/core/helpers'

import { TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'
import { resolveTargetStructure } from '@/v2019C1/extensions/lifecycle/instantiate/transaction/resolve-target-structure'
import { isTopologyLevel, readAttribute } from '@/v2019C1/helpers'

import type { LandedLevel, StructureLanding, TemplateLevel } from './landed-levels.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/**
 * The levels of the template above a primary (its Substation / VoltageLevel / Bay) that the placement lands on, as
 * `landsOn` says: a reference naming one names where it landed. Read in one walk up from the primary.
 */
export async function resolveLandedLevels(
	sourceQuery: Core.Query<Config>,
	params: {
		primaryRef: Scl.Ref<Scl.ElementsOf>
		/** Whether the placement lands a level of the template somewhere. */
		landsOn: (level: { id: string; tagName: string }) => boolean
	},
): Promise<LandedLevel[]> {
	const { primaryRef, landsOn } = params
	const ancestors = await sourceQuery.findAncestors(primaryRef, { stopAtTagName: 'Substation' })
	const landed: LandedLevel[] = []
	for (const ancestor of ancestors) {
		if (!isTopologyLevel(ancestor.tagName) || !landsOn(ancestor)) continue
		const uuid = readAttribute({ record: ancestor, name: 'uuid', defaults: 'none' })
		if (uuid) {
			landed.push({
				sourceRef: toRef(ancestor) as Scl.Ref<Scl.ElementsOf>,
				uuid,
				tagName: ancestor.tagName,
			})
		}
	}
	return landed
}

/** A scope with the levels the placement lands on: what a satellite's references may name. */
export function withLandedLevels(params: {
	scope: ContributionScope
	levels: readonly LandedLevel[]
}): ContributionScope {
	const { scope, levels } = params
	return new Set([
		...scope,
		...levels.map(function uuidOf(level) {
			return level.uuid
		}),
	])
}

/**
 * The levels of the template above a primary that a target structure holds a level of their tag for — where an
 * application lands in a project, or the TEMPLATE levels of a file extracted —, each redirected onto that level: a
 * reference to one names where it landed.
 */
export async function landOnStructure(
	sourceQuery: Core.Query<Config>,
	params: { primaryRef: Scl.Ref<Scl.ElementsOf>; structure: TargetStructure },
): Promise<StructureLanding> {
	const { primaryRef, structure } = params
	const levels = await resolveLandedLevels(sourceQuery, {
		primaryRef,
		landsOn: function heldByStructure(level) {
			return structure[level.tagName as keyof TargetStructure] !== undefined
		},
	})
	const redirects = levels.flatMap(function redirectOf(level): RedirectMapping[] {
		const target = structure[level.tagName as keyof TargetStructure]
		return target ? [{ sourceUuid: level.uuid, target: target as Scl.Ref<Scl.ElementsOf> }] : []
	})
	return { levels, redirects }
}

/** The Substations, VoltageLevels and Bays of a template, by uuid and tag: one read per tag. */
export async function readTemplateLevels(
	sourceQuery: Core.Query<Config>,
): Promise<TemplateLevel[]> {
	const levels: TemplateLevel[] = []
	for (const tagName of TOPOLOGY_STRUCTURAL_TAGS) {
		const records = await sourceQuery.getRecordsByTagName(tagName)
		for (const record of records) {
			const uuid = readAttribute({ record, name: 'uuid', defaults: 'none' })
			if (uuid) levels.push({ uuid, tagName })
		}
	}
	return levels
}

/**
 * Where the levels of a template land on a target structure, each by its tag — where a placement at that structure puts
 * what they hold: on the structure's level of that tag, else on the nearest level above it the structure holds, as
 * `resolveStructureRef` places a clone. A tag the placement creates lands on nothing the project holds (`created`).
 */
export function landLevels(params: {
	levels: readonly TemplateLevel[]
	structure: TargetStructure
	/** The tags of the levels the placement creates: what they hold is written in the created level, empty. */
	created?: ReadonlySet<string>
}): RedirectMapping[] {
	const { levels, structure, created } = params
	return levels.flatMap(function landingOf(level): RedirectMapping[] {
		if (created?.has(level.tagName)) return []
		const target = nearestStructureLevel({ structure, tagName: level.tagName })
		return target
			? [{ sourceUuid: level.uuid, target: toRef(target) as Scl.Ref<Scl.ElementsOf> }]
			: []
	})
}

/** The structure's level of a tag, else of the nearest tag above it the structure holds. */
function nearestStructureLevel(params: {
	structure: TargetStructure
	tagName: TopologyStructuralTag
}): TargetStructure[keyof TargetStructure] {
	const { structure } = params
	const index = TOPOLOGY_STRUCTURAL_TAGS.indexOf(params.tagName)
	for (const tagName of TOPOLOGY_STRUCTURAL_TAGS.slice(0, index + 1).reverse()) {
		const target = structure[tagName as keyof TargetStructure]
		if (target) return target
	}
	return undefined
}

/** `landLevels` of the template read in one pass: see `readTemplateLevels`. */
export async function landLevelsByTag(
	sourceQuery: Core.Query<Config>,
	params: { structure: TargetStructure; created?: ReadonlySet<string> },
): Promise<RedirectMapping[]> {
	const levels = await readTemplateLevels(sourceQuery)
	return landLevels({ levels, structure: params.structure, created: params.created })
}

/**
 * Where the levels of the template land when the project holds a primary at `at` (an instance, or the element a
 * placement lands under): on the project's levels at or above `at` (`landLevels`), from the template's levels read
 * once by the caller. None without `at`.
 */
export async function landAt(
	projectQuery: Core.Query<Config> | Core.Transaction<Config>,
	params: { levels: readonly TemplateLevel[]; at: AnyRefOrRecord | undefined },
): Promise<RedirectMapping[]> {
	const { levels, at } = params
	if (!at) return []
	const structure = await resolveTargetStructure(projectQuery, toRef(at) as Scl.Ref<Scl.ElementsOf>)
	return landLevels({ levels, structure })
}
