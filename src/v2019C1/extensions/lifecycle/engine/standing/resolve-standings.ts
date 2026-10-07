import { scopedId } from '../group'

import type {
	ChildStandings,
	ResolveStandingsParams,
	Standing,
	StandingChoice,
} from './standing.types'

/**
 * What stands, for each instance of a container, for each child it refers to — the one answer the
 * report announces and the update applies, the same for every layer (the layer says what an
 * instance holds and where it lives, `StandingPolicy`):
 *  - what an instance holds is its own (`owned`);
 *  - else, where that instance lives: the one element of that lineage no instance holds is taken;
 *    none → a new one is placed there; several → nothing tells which: the consumer chooses one of them
 *    or a new one (`choices`, keyed by `standingChoiceKey`), and nothing is written for that instance
 *    until it did (`undecided`);
 *  - an element taken by an instance is no longer free for the next one;
 *  - what no instance stands on where the consumer started is reconciled there (`unclaimed`).
 */
export async function resolveStandings(params: ResolveStandingsParams): Promise<ChildStandings[]> {
	const { instances, children, policy, decisionMappings } = params

	const resolved: ChildStandings[] = []
	for (const child of children) {
		const claimed = new Set<string>()
		for (const instance of instances) {
			for (const owned of policy.owned({ instance, child })) claimed.add(owned.id)
		}

		const standings = new Map<string, Standing>()
		const choices = new Map<string, StandingChoice>()
		for (const instance of instances) {
			const owned = policy.owned({ instance, child })
			if (owned.length > 0) {
				standings.set(instance.id, { kind: 'owned', elements: [...owned] })
				continue
			}
			if (!child.lineage) continue
			const level = await policy.levelOf({ instance, child })
			if (!level) continue

			const free = (await policy.lineageAt({ level, child })).filter(
				(candidate) => !claimed.has(candidate.id),
			)
			if (free.length === 0) {
				standings.set(instance.id, { kind: 'placed', level })
				continue
			}
			if (free.length === 1) {
				claimed.add(free[0].id)
				standings.set(instance.id, { kind: 'taken', element: free[0] })
				continue
			}

			const decision = decisionMappings?.get(standingChoiceKey({ instance, child: child.ref }))
			choices.set(instance.id, { candidates: free, level, ...(decision ? { decision } : {}) })
			const chosen =
				decision && 'existing' in decision
					? free.find((candidate) => candidate.id === decision.existing.id)
					: undefined
			if (chosen) {
				claimed.add(chosen.id)
				standings.set(instance.id, { kind: 'taken', element: chosen })
			} else if (decision && 'create' in decision) {
				standings.set(instance.id, { kind: 'placed', level })
			} else {
				standings.set(instance.id, { kind: 'undecided' })
			}
		}

		const anchorLevel = child.lineage ? await policy.anchorLevelOf?.(child) : undefined
		const unclaimed = anchorLevel
			? (await policy.lineageAt({ level: anchorLevel, child })).filter(
					(candidate) => !claimed.has(candidate.id),
				)
			: []
		resolved.push({ child, standings, choices, unclaimed })
	}
	return resolved
}

/** The key of the consumer's choice of what one instance of a container stands on, for a child. */
export function standingChoiceKey(params: {
	instance: { id: string }
	child: { id?: string }
}): string {
	return scopedId({ id: params.child.id ?? '', scopePrefix: params.instance.id })
}
