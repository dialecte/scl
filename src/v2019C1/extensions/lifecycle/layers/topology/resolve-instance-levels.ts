import { collectFrameElements, strictAncestorIds } from './ensure-topology-frame'
import { findFrameInstances } from './find-frame-instances'

import { toRef } from '@dialecte/core/helpers'

import type { InstanceLevels, ResolveInstanceLevelsParams } from './resolve-instance-levels.types'
import type { Scl } from '@/v2019C1/config'
import type { MappingReader } from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'

/**
 * For one instance of a template's unit, find the level of the project each level of the unit
 * stands on: the unit itself on the level the instance sits on, and each level below it on the
 * level, below its parent's, that an earlier placement created from it or mapped it onto
 * ({@link findFrameInstances}). A level the instance holds nothing for is new to it.
 */
export async function resolveInstanceLevels(
	reader: MappingReader,
	params: ResolveInstanceLevelsParams,
): Promise<InstanceLevels> {
	const { sourceQuery, scopeRef, frameInstance, matchKey } = params

	const instanceLevels = new Map<string, Scl.Ref<Scl.ElementsOf> | undefined>()
	if (!scopeRef.id) return instanceLevels
	instanceLevels.set(scopeRef.id, frameInstance)

	const frameElements = await collectFrameElements(sourceQuery, scopeRef)
	const contextIds = await strictAncestorIds(sourceQuery, scopeRef)

	for (const frameElement of frameElements) {
		const sourceId = frameElement.id
		if (!sourceId || contextIds.has(sourceId) || sourceId === scopeRef.id) continue

		const sourceAncestors = await sourceQuery.findAncestors(frameElement, {
			stopAtTagName: 'Substation',
		})
		const parent = sourceAncestors.find((ancestor) => instanceLevels.has(ancestor.id))
		const parentLevel = parent && instanceLevels.get(parent.id)
		if (!parentLevel) {
			instanceLevels.set(sourceId, undefined)
			continue
		}

		const [held] = await findFrameInstances(reader, {
			sourceQuery,
			scopeRef: frameElement,
			matchKey,
			within: parentLevel,
		})
		instanceLevels.set(
			sourceId,
			held ? (toRef(held.instance) as Scl.Ref<Scl.ElementsOf>) : undefined,
		)
	}
	return instanceLevels
}

/** The levels below the unit, as the matcher reads them: each lands on its level, or is new. */
export function toPinnedMatches(params: {
	instanceLevels: InstanceLevels
	scopeRef: Scl.Ref<Scl.ElementsOf>
}): Map<string, string | undefined> {
	const { instanceLevels, scopeRef } = params

	const pinnedMatches = new Map<string, string | undefined>()
	for (const [sourceId, level] of instanceLevels) {
		if (sourceId === scopeRef.id) continue
		pinnedMatches.set(sourceId, level?.id)
	}
	return pinnedMatches
}
