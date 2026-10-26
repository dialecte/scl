import { REFERENCE_TAG_NAMES } from '@/v2019C1/constants/reference-pairs'
import { classifyUnmatched } from '@/v2019C1/extensions/lifecycle/engine/removal-base'
import {
	collectInstanceScope,
	isNamedOutside,
	pointsInto,
} from '@/v2019C1/extensions/lifecycle/instance'

import type {
	MappingReader,
	ResolveSatelliteRemovalsParams,
	SatelliteRemoval,
} from './mapping.types'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * What goes of the satellites an instance holds that the template no longer brings anything for — the one answer the
 * report lists and the apply writes, read from the instance as it is before the update writes:
 *  - an element the template made (it carries the lineage of a source element the source no longer holds) goes whole,
 *    unless something outside the instance names it or is named by it (another instance's function a category
 *    classifies, another application's reference to a role): then only what the instance gave it goes;
 *  - an element of the project's own (no lineage) that a source element was mapped onto stays: what the instance gave
 *    it goes;
 *  - an element the source still holds, or the one a source satellite lands on, is reconciled, not removed.
 * What the instance gave an element is the references below it pointing into the instance.
 */
export async function resolveSatelliteRemovals(
	reader: MappingReader,
	params: ResolveSatelliteRemovalsParams,
): Promise<SatelliteRemoval[]> {
	const { sourceQuery, instancePrimaryRef, instanceSatelliteRefs, resolvedMappings, removalBase } =
		params
	const { matchKey } = params

	const mappedOntoIds = new Set<string>()
	for (const resolved of resolvedMappings.values()) {
		if (resolved.existing) mappedOntoIds.add(resolved.existing.id)
	}

	const removals: SatelliteRemoval[] = []
	let instanceScope: ReadonlySet<string> | undefined
	for (const instanceSatelliteRef of instanceSatelliteRefs) {
		if (instanceSatelliteRef.id && mappedOntoIds.has(instanceSatelliteRef.id)) continue
		const satellite = await reader.any.getTree(instanceSatelliteRef)
		if (!satellite) continue

		// an element of the project's own goes as a removal; one the template made as its source element reads
		const lineage = await reader.any.getAttribute(satellite, { name: matchKey })
		let change: SatelliteRemoval['change'] | 'still-held' = 'removed'
		if (lineage) {
			const inSource = await sourceQuery.any.findByAttributes({
				tagName: satellite.tagName,
				attributes: { uuid: lineage },
			})
			change = classifyUnmatched({
				tagName: satellite.tagName,
				lineage,
				inSource: inSource.length > 0,
				removalBase,
			})
		}
		if (change === 'still-held') continue

		instanceScope ??= await collectInstanceScope(reader, instancePrimaryRef)
		const contributions: AnyTreeRecord[] = []
		await collectContributions(reader, { node: satellite, instanceScope, contributions })
		// the project's own element stays; one the template made goes unless something outside names it
		const whole = lineage ? !(await isNamedOutside(reader, { satellite, instanceScope })) : false
		removals.push({ satellite, change, whole, contributions })
	}
	return removals
}

/**
 * The references below `node` pointing into the instance, at any depth: a category nests its
 * references in sub-categories.
 */
async function collectContributions(
	reader: MappingReader,
	params: {
		node: AnyTreeRecord
		instanceScope: ReadonlySet<string>
		contributions: AnyTreeRecord[]
	},
): Promise<void> {
	const { node, instanceScope, contributions } = params
	for (const child of node.tree) {
		if (!REFERENCE_TAG_NAMES.has(child.tagName)) {
			await collectContributions(reader, { node: child, instanceScope, contributions })
			continue
		}
		if (await pointsInto(reader, { reference: child, scope: instanceScope }))
			contributions.push(child)
	}
}
