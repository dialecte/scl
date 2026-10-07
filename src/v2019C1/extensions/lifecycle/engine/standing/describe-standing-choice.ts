import { standingChoiceKey } from './resolve-standings'

import { toRef } from '@dialecte/core/helpers'

import { describeCandidate } from '@/v2019C1/extensions/lifecycle/mapping/describe-mapping'
import { buildElementPath } from '@/v2019C1/extensions/reference/query/build'

import type { StandingChild, StandingChoice } from './standing.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { MappingCandidate, ReportMapping } from '@/v2019C1/extensions/lifecycle/mapping'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * The choice of what one instance of a container stands on, for a child, as the report lists it: a
 * mapping decided for that instance (`placedFor`, `id` scoped to it, `sourceId` the child), its
 * candidates the elements that qualify; undecided until the consumer passes one, or a new one.
 */
export async function describeStandingChoice(
	query: Core.Query<Config>,
	params: { child: StandingChild; instance: AnyTrackedRecord; choice: StandingChoice },
): Promise<ReportMapping> {
	const { child, instance, choice } = params
	const candidates: MappingCandidate[] = []
	for (const candidate of choice.candidates) {
		candidates.push(await describeCandidate(query, toRef(candidate) as Scl.Ref<Scl.ElementsOf>))
	}
	const created = choice.decision && 'create' in choice.decision
	const parentPath = created ? (await buildElementPath(query, choice.level))?.path : undefined
	return {
		id: standingChoiceKey({ instance, child: child.ref }),
		sourceId: child.ref.id,
		placedFor: toRef(instance),
		tagName: child.ref.tagName,
		kind: 'shared',
		...(choice.decision ? { mapping: choice.decision } : {}),
		...(parentPath ? { parentPath } : {}),
		reason: choice.decision ? 'decision' : 'none',
		ambiguous: true,
		selectable: true,
		locked: false,
		candidates,
	}
}
