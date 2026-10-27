import { resolveStandings } from '@/v2019C1/extensions/lifecycle/engine/standing'
import { resolveStructureRef } from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type { ResolveSharedFunctionsParams } from './resolve-shared-functions.types'
import type { Config, Scl } from '@/v2019C1/config'
import type {
	ChildStandings,
	StandingChild,
	StandingPolicy,
} from '@/v2019C1/extensions/lifecycle/engine/standing'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * What stands for each function an application composes on its first placement, when the consumer merges the
 * functions applications share (`Resolution.sharedFunctions: 'merge'`) — the engine's standing rule over the level
 * each function is placed on:
 *  - a function of the project there with an identical template reference is taken: its lineage is the composed
 *    function's uuid, or names a function of the template carrying the same `templateUuid` (two functions of the
 *    template made from one library function);
 *  - none: placed; several: the consumer chooses one of them or a new one (keyed for the level the application lands
 *    on, `placedFor`), and nothing is written until it did;
 *  - a function one composed function stands on is no longer free for the next: two functions the application composes
 *    stay two.
 */
export async function resolveSharedFunctions(
	query: Core.Query<Config>,
	params: ResolveSharedFunctionsParams,
): Promise<ChildStandings[]> {
	const { sourceQuery, functionRefs, structure, placedFor } = params

	const children: StandingChild[] = []
	for (const functionRef of functionRefs) {
		const lineage = await sourceQuery.getAttribute(functionRef, { name: 'uuid' })
		children.push({ ref: functionRef, lineage })
	}

	// what an earlier composed function stands on, by record id
	const stoodOn = new Set<string>()
	const policy: StandingPolicy = {
		owned: () => [],
		levelOf: async ({ child }) =>
			(await resolveStructureRef(sourceQuery, child.ref, structure)) as Scl.Ref<Scl.ElementsOf>,
		lineageAt: async ({ level, child }) => {
			const sharing = await findSharingFunctions(query, {
				sourceQuery,
				level,
				child,
				matchKey: params.matchKey,
			})
			return sharing.filter((candidate) => !stoodOn.has(candidate.id))
		},
	}

	const resolved: ChildStandings[] = []
	for (const child of children) {
		const [standings] = await resolveStandings({
			instances: [placedFor],
			children: [child],
			policy,
			decisionMappings: params.decisionMappings,
		})
		const standing = standings.standings.get(placedFor.id)
		if (standing?.kind === 'taken') stoodOn.add(standing.element.id)
		resolved.push(standings)
	}
	return resolved
}

/**
 * The functions directly under a level of the project whose template reference is the composed function's: its own
 * uuid, or that of a function of the template made from the same template element.
 */
async function findSharingFunctions(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		level: Scl.Ref<Scl.ElementsOf>
		child: StandingChild
		matchKey: MatchKey
	},
): Promise<AnyTrackedRecord[]> {
	const { sourceQuery, level, child, matchKey } = params
	const lineages = await readTemplateReferences(sourceQuery, child)
	const sharing: AnyTrackedRecord[] = []
	for (const candidate of await query.any.getChildren(level, 'Function')) {
		const lineage = await query.any.getAttribute(candidate, { name: matchKey })
		if (lineage && lineages.has(lineage)) sharing.push(candidate)
	}
	return sharing
}

/** The uuids of the template's functions sharing the composed function's template reference, its own included. */
async function readTemplateReferences(
	sourceQuery: Core.Query<Config>,
	child: StandingChild,
): Promise<ReadonlySet<string>> {
	const lineages = new Set<string>(child.lineage ? [child.lineage] : [])
	const templateUuid = await sourceQuery.getAttribute(child.ref, { name: 'templateUuid' })
	if (!templateUuid) return lineages
	const siblings = await sourceQuery.findByAttributes({
		tagName: 'Function',
		attributes: { templateUuid },
	})
	for (const sibling of siblings) {
		const uuid = await sourceQuery.getAttribute(sibling, { name: 'uuid' })
		if (uuid) lineages.add(uuid)
	}
	return lineages
}
