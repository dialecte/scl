import { scopedId } from '@/v2019C1/extensions/lifecycle/engine/group'

import type { WithPrimaryMoves, WithPrimaryMovesParams } from './primary-moves.types'
import type {
	DecisionGroup,
	DiffNode,
	ReportInstance,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PrimaryMove } from '@/v2019C1/extensions/lifecycle/layers/topology/resolve-primary-parents.types'

/**
 * The report instances of a process section with each primary the revision puts on another level marked as one move:
 * its root `moved` (from the level it is held on, to the level the revision puts it on, the template's when that level
 * is gained), in a group of its own suggested accept, its content changes in their own groups as before. The move
 * waits for the addition of a gained level it lands in; a removal of the level it leaves, or of one above, waits for
 * the move.
 */
export function withPrimaryMoves(params: WithPrimaryMovesParams): WithPrimaryMoves {
	const moveById = new Map(params.moves.map((move) => [move.instance.id ?? '', move]))
	const marked = params.primaryInstances.map(function markedOf(instance) {
		const move = instance.rootRef?.id ? moveById.get(instance.rootRef.id) : undefined
		return move ? markedMove({ instance, move }) : instance
	})
	const moveGroups = marked.flatMap((instance) =>
		instance.groups.filter((group) => group.change === 'moved' && group.primary === instance.tree),
	)
	const frameGroups = params.frameInstances.flatMap((instance) => instance.groups)
	const waitsFor = new Map<string, string[]>()
	const waitedBy = new Map<string, string[]>()
	for (const group of moveGroups) {
		const move = group.primary.instanceRef?.id
			? moveById.get(group.primary.instanceRef.id)
			: undefined
		if (!move) continue
		const added = frameGroups.find((frameGroup) =>
			addedSourceIdsOf(frameGroup).includes(move.toSource.id ?? ''),
		)
		if (!move.to && added) waitsFor.set(group.id, [added.id])
		for (const removal of frameGroups) {
			const leaves =
				(removal.change === 'removed' || removal.change === 'target-only') &&
				removal.primary.instanceRef?.id !== undefined &&
				move.fromChain.includes(removal.primary.instanceRef.id)
			if (leaves) waitedBy.set(removal.id, [...(waitedBy.get(removal.id) ?? []), group.id])
		}
	}
	return {
		frameInstances: params.frameInstances.map((instance) =>
			withDependencies({ instance, extra: waitedBy }),
		),
		primaryInstances: marked.map((instance) => withDependencies({ instance, extra: waitsFor })),
	}
}

/** A primary's report instance with its root marked as moved, the root's group a move. */
function markedMove(params: { instance: ReportInstance; move: PrimaryMove }): ReportInstance {
	const { instance, move } = params
	const tree: DiffNode = {
		...instance.tree,
		change: 'moved',
		movedFrom: move.from,
		movedTo: move.to ?? move.toSource,
	}
	const own = instance.groups.find((group) => group.primary === instance.tree)
	const moveGroup: DecisionGroup = own
		? { ...own, change: 'moved', title: `moved ${tree.tagName}`, primary: tree }
		: {
				id: scopedId({
					id: `${tree.tagName}:${tree.sourceRef?.id ?? tree.instanceRef?.id ?? ''}`,
					scopePrefix: instance.rootRef?.id ?? '',
				}),
				change: 'moved',
				title: `moved ${tree.tagName}`,
				primary: tree,
				companions: [],
				dependsOn: [],
				suggestedAction: 'accept',
			}
	const groups = own
		? instance.groups.map((group) => (group === own ? moveGroup : group))
		: [moveGroup, ...instance.groups]
	return { ...instance, tree, groups, upToDate: false }
}

/** An instance whose groups take the dependencies listed for them, each id once. */
function withDependencies(params: {
	instance: ReportInstance
	extra: ReadonlyMap<string, readonly string[]>
}): ReportInstance {
	const { instance, extra } = params
	if (!instance.groups.some((group) => extra.has(group.id))) return instance
	return {
		...instance,
		groups: instance.groups.map(function withExtra(group) {
			const added = extra.get(group.id)
			return added ? { ...group, dependsOn: [...new Set([...group.dependsOn, ...added])] } : group
		}),
	}
}

/** The source ids of what a group adds: its primary's subtree and its companions'. */
function addedSourceIdsOf(group: DecisionGroup): string[] {
	return [group.primary, ...group.companions].flatMap(addedSourceIdsBelow)
}

function addedSourceIdsBelow(node: DiffNode): string[] {
	const own = node.change === 'added' && node.sourceRef?.id ? [node.sourceRef.id] : []
	return [...own, ...node.children.flatMap(addedSourceIdsBelow)]
}
