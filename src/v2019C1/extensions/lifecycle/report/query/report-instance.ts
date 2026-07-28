import { toRef } from '@dialecte/core/helpers'

import { collectTreeIds } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { extractElementTitle } from '@/v2019C1/extensions/presentation/query'

import type { Config } from '@/v2019C1/config'
import type { InstanceDiff, ReportInstance } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/**
 * Enrich a per-instance {@link InstanceDiff} into a consumer-facing {@link ReportInstance}:
 * resolve the human title, the linkage flag (recognised as an instantiation of the loaded
 * template — `templateUuid`/`originUuid` lineage on the root), the up-to-date flag (no
 * decision groups), and the member id set (the instance subtree ∪ its folded satellite
 * companions) used to highlight the whole instance cluster on select.
 *
 * For a first-time instantiate (`instance` undefined) there is no existing instance:
 * `linked`/`rootRef` are absent and the member ids come from the source (added) tree.
 */
export async function buildReportInstance(
	query: Core.Query<Config>,
	params: {
		instanceDiff: InstanceDiff
		instance: AnyRefOrRecord | undefined
		sourceQuery: Core.Query<Config>
		sourceRef: AnyRefOrRecord
	},
): Promise<ReportInstance> {
	const { instanceDiff, instance, sourceQuery, sourceRef } = params
	const upToDate = instanceDiff.groups.length === 0
	const memberIds = collectMemberIds(instanceDiff)

	if (!instance) {
		return {
			rootRef: undefined,
			title: await extractElementTitle(sourceQuery, sourceRef),
			linked: false,
			upToDate,
			tree: instanceDiff.root,
			groups: instanceDiff.groups,
			memberIds,
		}
	}

	const { templateUuid, originUuid } = await query.any.getAttributes(instance)
	const linked = Boolean(templateUuid || originUuid)

	return {
		rootRef: toRef(instance),
		title: await extractElementTitle(query, instance),
		linked,
		upToDate,
		tree: instanceDiff.root,
		groups: instanceDiff.groups,
		memberIds,
	}
}

/**
 * Every element id belonging to this instance: the primary diff subtree PLUS every folded
 * satellite companion subtree (a `FunctionCategory`/`AllocationRole`/... that lives OUTSIDE
 * the root). Ids are collected from BOTH sides — `instanceRef` for existing/removed nodes and
 * `sourceRef` for added nodes — because an added satellite (first-time instantiate, or a
 * newly-carried one on update) has only a source ref. The consumer maps these keys to its own
 * staged ids; missing a side would drop the satellite from the highlight cluster.
 */
function collectMemberIds(instanceDiff: InstanceDiff): string[] {
	const ids = new Set<string>([
		...collectTreeIds(instanceDiff.root, 'instanceRef'),
		...collectTreeIds(instanceDiff.root, 'sourceRef'),
	])
	for (const group of instanceDiff.groups)
		for (const companion of group.companions) {
			for (const id of collectTreeIds(companion, 'instanceRef')) ids.add(id)
			for (const id of collectTreeIds(companion, 'sourceRef')) ids.add(id)
		}
	return [...ids]
}
