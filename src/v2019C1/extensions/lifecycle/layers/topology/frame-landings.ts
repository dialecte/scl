import { FRAME_OWN_CONTENT_OMIT } from './ensure-topology-frame.constants'

import { toRef } from '@dialecte/core/helpers'

import { matchChild } from '@/v2019C1/extensions/lifecycle/engine/match-child'
import { indexByMatchKey } from '@/v2019C1/extensions/lifecycle/engine/match-key'
import { readAttribute } from '@/v2019C1/helpers'

import type { PlacementLevel } from './resolve-placement-mappings.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * Where the placement of a unit lands the template's elements on elements the project holds, read before anything is
 * written: each level on the element it is mapped onto, and, below a level of the unit mapped onto one, each identified
 * element of its own content on the element of the project it lands on (an equipment, a logical node of it), as the
 * frame pours that content. The report and the apply read what the project holds applying to them through it alike.
 */
export async function resolveFrameLandings(
	projectQuery: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		placementLevels: readonly PlacementLevel[]
		matchKey: MatchKey
	},
): Promise<RedirectMapping[]> {
	const { sourceQuery, placementLevels, matchKey } = params
	const landings: RedirectMapping[] = []
	for (const level of placementLevels) {
		const existing = level.resolved.existing
		if (!existing) continue
		const target = toRef(existing) as Scl.Ref<Scl.ElementsOf>
		// a level above the unit is the project's own context: the template gives it nothing
		if (level.context) {
			const sourceUuid = await sourceQuery.any.getAttribute(level.sourceRef, { name: 'uuid' })
			if (sourceUuid) landings.push({ sourceUuid, target })
			continue
		}
		const sourceTree = await sourceQuery.any.getTree(level.sourceRef)
		const instanceTree = await projectQuery.any.getTree(target)
		if (!sourceTree || !instanceTree) continue
		const sourceUuid = readAttribute({ record: sourceTree, name: 'uuid', defaults: 'none' })
		if (sourceUuid) landings.push({ sourceUuid, target })
		const index = new Map<string, AnyTreeRecord>()
		await indexByMatchKey(projectQuery, { node: instanceTree, index, matchKey })
		await collectContentLandings(sourceQuery, {
			projectQuery,
			sourceNode: sourceTree,
			instanceNode: instanceTree,
			index,
			matchKey,
			landings,
		})
	}
	return landings
}

/** The identified elements of a level's own content that land on elements the project holds, as `contribute` pairs them. */
async function collectContentLandings(
	sourceQuery: Core.Query<Config>,
	params: {
		projectQuery: Core.Query<Config>
		sourceNode: AnyTreeRecord
		instanceNode: AnyTreeRecord
		index: Map<string, AnyTreeRecord>
		matchKey: MatchKey
		landings: RedirectMapping[]
	},
): Promise<void> {
	const { projectQuery, sourceNode, instanceNode, index, matchKey, landings } = params
	const matchedInstanceIds = new Set<string>()
	for (const sourceChild of sourceNode.tree) {
		// the levels below and the functions and applications are placed by another pass
		if (FRAME_OWN_CONTENT_OMIT.includes(sourceChild.tagName)) continue
		const match = await matchChild(sourceQuery, {
			targetQuery: projectQuery,
			sourceChild,
			instanceParent: instanceNode,
			index,
			matchedInstanceIds,
			matchKey,
			refsAlwaysAdded: true,
			matchContainersByName: true,
			sourceIsProject: false,
		})
		if (!match) continue
		matchedInstanceIds.add(match.record.id)
		const sourceUuid = readAttribute({ record: sourceChild, name: 'uuid', defaults: 'none' })
		if (sourceUuid)
			landings.push({ sourceUuid, target: toRef(match.record) as Scl.Ref<Scl.ElementsOf> })
		await collectContentLandings(sourceQuery, {
			...params,
			sourceNode: sourceChild,
			instanceNode: match.record,
		})
	}
}
