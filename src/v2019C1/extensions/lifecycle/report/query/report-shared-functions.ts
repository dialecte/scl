import { toRef } from '@dialecte/core/helpers'

import {
	describeStandingChoice,
	standingChoiceKey,
} from '@/v2019C1/extensions/lifecycle/engine/standing'
import { resolveTargetStructure } from '@/v2019C1/extensions/lifecycle/instantiate/transaction/resolve-target-structure'
import { resolveSharedFunctions } from '@/v2019C1/extensions/lifecycle/layers/application'
import { describeCandidate } from '@/v2019C1/extensions/lifecycle/mapping/describe-mapping'
import { resolveStructureRef } from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type {
	ReportedSharedFunctions,
	ReportSharedFunctionsParams,
} from './report-shared-functions.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { StandingChild } from '@/v2019C1/extensions/lifecycle/engine/standing'
import type { ReportMapping } from '@/v2019C1/extensions/lifecycle/mapping'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * What a first placement merging shared functions (`Resolution.sharedFunctions: 'merge'`) lists of the functions the
 * application composes, as the apply stands on them (`resolveSharedFunctions`): a function taken is listed as the
 * mapping it is — shown, the option decided it —, a choice the consumer makes as a mapping to decide, undecided until
 * made; the functions placed are those the report lists as first placements.
 */
export async function reportSharedFunctions(
	query: Core.Query<Config>,
	params: ReportSharedFunctionsParams,
): Promise<ReportedSharedFunctions> {
	const { sourceQuery, applicationRef, functionRefs, anchor } = params
	const anchorRecord = anchor ? await query.getRecord(anchor) : undefined
	if (!anchor || !anchorRecord) return { mappings: [], placed: [...functionRefs], taken: [] }
	const structure = await resolveTargetStructure(query, anchor)
	const landing = await resolveStructureRef(sourceQuery, applicationRef, structure)
	const placedFor = await query.any.getRecord(landing)
	if (!placedFor) return { mappings: [], placed: [...functionRefs], taken: [] }

	const standings = await resolveSharedFunctions(query, {
		sourceQuery,
		functionRefs,
		structure,
		placedFor,
		decisionMappings: params.decisionMappings,
		matchKey: params.matchKey,
	})
	const mappings: ReportMapping[] = []
	const placed: Scl.Ref<'Function'>[] = []
	const taken: RedirectMapping[] = []
	for (const { child, standings: byPlacement, choices } of standings) {
		const standing = byPlacement.get(placedFor.id)
		const choice = choices.get(placedFor.id)
		if (choice) {
			// decided for the placement as a whole: not scoped to an element of the project
			const described = await describeStandingChoice(query, { child, instance: placedFor, choice })
			mappings.push({ ...described, placedFor: undefined })
		}
		if (standing?.kind === 'taken' && child.lineage) {
			const element = toRef(standing.element) as Scl.Ref<Scl.ElementsOf>
			taken.push({ sourceUuid: child.lineage, target: element })
			if (!choice) mappings.push(await describeTakenFunction(query, { child, placedFor, element }))
		}
		if (!standing || standing.kind === 'placed') placed.push(child.ref as Scl.Ref<'Function'>)
	}
	return { mappings, placed, taken }
}

/** The function a composed function stands on, the one found: shown as the mapping it is, the option decided it. */
async function describeTakenFunction(
	query: Core.Query<Config>,
	params: { child: StandingChild; placedFor: AnyTrackedRecord; element: Scl.Ref<Scl.ElementsOf> },
): Promise<ReportMapping> {
	const { child, placedFor, element } = params
	const candidate = await describeCandidate(query, element)
	return {
		id: standingChoiceKey({ instance: placedFor, child: child.ref }),
		sourceId: child.ref.id,
		tagName: child.ref.tagName,
		kind: 'shared',
		mapping: { existing: element },
		reason: 'only',
		ambiguous: false,
		selectable: true,
		locked: true,
		candidates: [candidate],
	}
}
