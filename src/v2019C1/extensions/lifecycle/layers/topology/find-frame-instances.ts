import { toRef } from '@dialecte/core/helpers'

import { TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'
import { findInstancesByTemplateUuid } from '@/v2019C1/extensions/lifecycle/instance'
import { findMappingPolicy } from '@/v2019C1/extensions/lifecycle/mapping'

import type { FindFrameInstancesParams, FrameInstance } from './find-frame-instances.types'
import type { Scl } from '@/v2019C1/config'
import type { MappingReader } from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'
import type { AnyTrackedRecord, AnyTreeRecord } from '@dialecte/core'

const STRUCTURAL_TAGS: readonly string[] = TOPOLOGY_STRUCTURAL_TAGS

/**
 * Find the levels of the project the instances of a template's unit sit on — where an earlier
 * placement put it. Nothing in the file records a placement, so it is read from what it wrote:
 *  - a level CREATED from the unit carries its lineage;
 *  - a level of the project the unit was MAPPED onto does not: it is the level of the unit's kind
 *    that contains an element created from what the unit holds of its own (a function, an
 *    application, equipment, a level below).
 * A shared element the unit holds is no evidence: it may have landed anywhere in the project.
 */
export async function findFrameInstances(
	reader: MappingReader,
	params: FindFrameInstancesParams,
): Promise<FrameInstance[]> {
	const { sourceQuery, scopeRef, within } = params
	const matchKey = params.matchKey ?? 'templateUuid'

	const sourceUuid = await sourceQuery.any.getAttribute(scopeRef, { name: 'uuid' })
	const everyCreated = await findInstancesByTemplateUuid(reader, {
		tagName: scopeRef.tagName,
		sourceUuid,
		matchKey,
	})
	const created: AnyTrackedRecord[] = []
	for (const instance of everyCreated) {
		if (await isWithin(reader, { level: instance, within })) created.push(instance)
	}
	const frameInstances: FrameInstance[] = created.map((instance) => ({
		instance,
		projectOwned: false,
	}))
	const knownIds = new Set(created.map((instance) => instance.id))

	const sourceTree = await sourceQuery.any.getTree(scopeRef)
	if (!sourceTree) return frameInstances

	const heldElements: AnyTreeRecord[] = []
	await collectHeldElements(sourceQuery, { node: sourceTree, heldElements })

	for (const heldElement of heldElements) {
		const heldUuid = await sourceQuery.any.getAttribute(heldElement, { name: 'uuid' })
		const placedElements = await findInstancesByTemplateUuid(reader, {
			tagName: heldElement.tagName as Scl.ElementsOf,
			sourceUuid: heldUuid,
			matchKey,
		})
		for (const placedElement of placedElements) {
			const placedRef = toRef(placedElement) as Scl.Ref<Scl.ElementsOf>
			const ancestors = await reader.findAncestors(placedRef, { stopAtTagName: 'Substation' })
			const level = ancestors.find((ancestor) => ancestor.tagName === scopeRef.tagName)
			if (!level || knownIds.has(level.id)) continue
			if (!(await isWithin(reader, { level, within }))) continue
			knownIds.add(level.id)
			frameInstances.push({ instance: level, projectOwned: true })
		}
	}
	return frameInstances
}

/** Whether a level sits below `within` — any level does when no scope is given. */
async function isWithin(
	reader: MappingReader,
	params: { level: AnyTrackedRecord; within: FindFrameInstancesParams['within'] },
): Promise<boolean> {
	const { level, within } = params
	if (!within) return true

	const levelRef = toRef(level) as Scl.Ref<Scl.ElementsOf>
	const ancestors = await reader.findAncestors(levelRef, { stopAtTagName: 'Substation' })
	return ancestors.some((ancestor) => ancestor.id === within.id)
}

/**
 * The identified elements a level holds of its own, each taken at its top (what it holds in turn
 * says nothing more), the shared elements left out. A structural level without identity is walked
 * through: what it holds is held by the level above it too.
 */
async function collectHeldElements(
	sourceQuery: FindFrameInstancesParams['sourceQuery'],
	params: { node: AnyTreeRecord; heldElements: AnyTreeRecord[] },
): Promise<void> {
	const { node, heldElements } = params

	for (const child of node.tree) {
		if (findMappingPolicy(child.tagName)) continue
		const uuid = await sourceQuery.any.getAttribute(child, { name: 'uuid' })
		if (uuid) {
			heldElements.push(child)
			if (!STRUCTURAL_TAGS.includes(child.tagName)) continue
		}
		await collectHeldElements(sourceQuery, { node: child, heldElements })
	}
}
