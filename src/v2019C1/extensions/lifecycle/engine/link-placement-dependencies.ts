import { toRef } from '@dialecte/core/helpers'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'

import type { DecisionGroup, DiffNode, ReportInstance } from './diff.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * What the groups of one placement depend on, among the groups of that same placement:
 *  - a group placing an element inside an element another group adds depends on it — a level
 *    takes what it holds with it;
 *  - a group adding a reference to an element another group places depends on that group — a
 *    reference goes with what it points at.
 *
 * Leaving out the level, or what is referred to, while keeping what depends on it is then refused
 * (`assertDecisionsCoherent`): nothing lands in a level that is not written, no reference points at
 * nothing. `instances` are the report instances of ONE placement (a first placement, or what an
 * update places for one instance).
 */
export async function linkPlacementDependencies(
	sourceQuery: Core.Query<Config>,
	params: { instances: readonly ReportInstance[] },
): Promise<void> {
	const groups = params.instances.flatMap((instance) => instance.groups)
	const { holders, placers } = await indexAddedElements(sourceQuery, groups)

	for (const group of groups) {
		const holder = await findHolder(sourceQuery, { group, holders })
		if (holder) addDependency({ group, dependency: holder })
		for (const placer of await findReferredPlacers(sourceQuery, { group, placers })) {
			addDependency({ group, dependency: placer })
		}
	}
}

/**
 * The groups adding each source element (`holders`, by record id: the element and everything added
 * with it) and the groups placing each element references point at (`placers`, by the uuid of
 * their primary).
 */
async function indexAddedElements(
	sourceQuery: Core.Query<Config>,
	groups: readonly DecisionGroup[],
): Promise<{
	holders: Map<string, DecisionGroup>
	placers: Map<string, DecisionGroup>
}> {
	const holders = new Map<string, DecisionGroup>()
	const placers = new Map<string, DecisionGroup>()
	for (const group of groups) {
		for (const node of addedNodes(group)) {
			if (node.sourceRef?.id) holders.set(node.sourceRef.id, group)
		}
		const { primary } = group
		if (primary.change !== 'added' || !primary.sourceRef) continue
		const uuid = await sourceQuery.any.getAttribute(
			toRef(primary.sourceRef) as Scl.Ref<Scl.ElementsOf>,
			{ name: 'uuid' },
		)
		if (uuid) placers.set(uuid, group)
	}
	return { holders, placers }
}

/** The group adding the element the group's primary is placed in — its nearest added ancestor. */
async function findHolder(
	sourceQuery: Core.Query<Config>,
	params: { group: DecisionGroup; holders: ReadonlyMap<string, DecisionGroup> },
): Promise<DecisionGroup | undefined> {
	const { group, holders } = params
	const { primary } = group
	if (primary.change !== 'added' || !primary.sourceRef) return undefined

	let parent = (
		await sourceQuery.any.getRecord(toRef(primary.sourceRef) as Scl.Ref<Scl.ElementsOf>)
	)?.parent
	while (parent) {
		const holder = holders.get(parent.id)
		if (holder) return holder === group ? undefined : holder
		parent = (await sourceQuery.any.getRecord(toRef(parent) as Scl.Ref<Scl.ElementsOf>))?.parent
	}
	return undefined
}

/** The other groups placing an element one of the group's added references points at. */
async function findReferredPlacers(
	sourceQuery: Core.Query<Config>,
	params: { group: DecisionGroup; placers: ReadonlyMap<string, DecisionGroup> },
): Promise<DecisionGroup[]> {
	const { group, placers } = params

	const referred: DecisionGroup[] = []
	for (const node of addedNodes(group)) {
		const pairs = UUID_REFERENCE_PAIRS[node.tagName as keyof typeof UUID_REFERENCE_PAIRS]
		if (!pairs?.length || !node.sourceRef) continue
		const attributes = await sourceQuery.any.getAttributes(
			toRef(node.sourceRef) as Scl.Ref<Scl.ElementsOf>,
		)
		for (const pair of pairs) {
			const placer = placers.get(attributes[pair.attribute.uuid] ?? '')
			if (placer && placer !== group && !referred.includes(placer)) referred.push(placer)
		}
	}
	return referred
}

/** Every node the group adds: its primary and companions, and what they carry. */
function addedNodes(group: DecisionGroup): Set<DiffNode> {
	const added = new Set<DiffNode>()
	const pending: DiffNode[] = [group.primary, ...group.companions]
	while (pending.length > 0) {
		const node = pending.pop() as DiffNode
		if (added.has(node)) continue
		pending.push(...node.children)
		if (node.change === 'added') added.add(node)
	}
	return added
}

function addDependency(params: { group: DecisionGroup; dependency: DecisionGroup }): void {
	const { group, dependency } = params
	if (!group.dependsOn.includes(dependency.id)) group.dependsOn.push(dependency.id)
}
