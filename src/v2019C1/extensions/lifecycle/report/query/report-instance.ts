import { toRef } from '@dialecte/core/helpers'

import { of } from '@/v2019C1/extensions/info/query'

import type { Config } from '@/v2019C1/config'
import type { InstanceDiff, ReportInstance } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/**
 * Enrich a per-instance {@link InstanceDiff} into a consumer-facing {@link ReportInstance}:
 * resolve the human title, the linkage flag (recognised as an instantiation of the loaded
 * template — `templateUuid`/`originUuid` lineage on the root), and the up-to-date flag (no
 * decision groups).
 *
 * For a first-time instantiate (`instance` undefined) there is no existing instance:
 * `linked`/`rootRef` are absent.
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

	if (!instance) {
		return {
			rootRef: undefined,
			title: (await of(sourceQuery, sourceRef)).title,
			linked: false,
			upToDate,
			tree: instanceDiff.root,
			groups: instanceDiff.groups,
			mappings: instanceDiff.mappings ?? [],
		}
	}

	const { templateUuid, originUuid } = await query.any.getAttributes(instance)
	const linked = Boolean(templateUuid || originUuid)

	return {
		rootRef: toRef(instance),
		title: (await of(query, instance)).title,
		linked,
		upToDate,
		tree: instanceDiff.root,
		groups: instanceDiff.groups,
		mappings: instanceDiff.mappings ?? [],
	}
}
