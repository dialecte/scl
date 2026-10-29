import { toRef } from '@dialecte/core/helpers'

import { isTopologyLevel, readAttribute } from '@/v2019C1/helpers'

import type { LandedLevel, StructureLanding } from './landed-levels.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'

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
