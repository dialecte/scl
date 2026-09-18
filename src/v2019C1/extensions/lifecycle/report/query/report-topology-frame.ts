import { buildReportInstance } from './report-instance'

import { FRAME_OMIT_CHILD_TAGS } from '@/v2019C1/constants'
import { diff } from '@/v2019C1/extensions/lifecycle/engine/diff'
import {
	findInstancesByTemplateUuid,
	scopeToTargetInstance,
} from '@/v2019C1/extensions/lifecycle/instance'
import { matchKeyForScenario } from '@/v2019C1/extensions/lifecycle/scenario'

import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { ReportInstance } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * Report (read-only) what `update.ssd` would change in the topology scope's OWN structural content
 * (Substation/VoltageLevel/Bay attributes + BayType + equipment), matched by the stamped
 * `templateUuid` lineage. The fn/app tags are a BOUNDARY: their changes are covered by the per-primary
 * Application/Function reports, so this diff excludes them.
 *
 * Several bays may share one `templateUuid` (a bay-typical instantiated more than once), so EVERY
 * matching instance is diffed and returned as its own {@link ReportInstance}; each owns its groups so
 * the decision layer can target a subset. Returns `[]` for a first-time instantiate (the frame is the
 * added fn/app primaries on the fast track) — the added scope-root group is emitted separately.
 */
export async function reportTopologyFrame(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		scopeRef: Scl.Ref<TopologyStructuralTag>
		scenario?: LifecycleScenario
		targetInstance?: Scl.Ref<Scl.ElementsOf>
	},
): Promise<ReportInstance[]> {
	const { sourceQuery, scopeRef, scenario, targetInstance } = params
	const matchKey = matchKeyForScenario(scenario)

	// On instantiate the frame scope root is entirely ADDED: diff the source root against NO instance
	// (instanceRootRef undefined) so the added frame (Substation/VoltageLevel/Bay attrs + equipment,
	// fn/app omitted) surfaces as its own report instance with `rootRef` undefined. `apply` then fills
	// each node's `appliedRef` (the placed TEMPLATE_1 element), so the consumer places the added frame
	// on the NEW bay — not conflated with the existing same-named one.
	if (scenario === 'instantiate') {
		const instanceDiff = await diff({
			sourceQuery,
			targetQuery: query,
			sourceRootRef: scopeRef,
			instanceRootRef: undefined,
			matchKey,
			omit: FRAME_OMIT_CHILD_TAGS,
		})
		const reportInstance = await buildReportInstance(query, {
			instanceDiff,
			instance: undefined,
			sourceQuery,
			sourceRef: scopeRef,
		})
		return [reportInstance]
	}

	const { uuid } = await sourceQuery.getAttributes(scopeRef)
	const matched = await findInstancesByTemplateUuid(query, {
		tagName: scopeRef.tagName,
		sourceUuid: uuid,
		matchKey,
	})
	const instances = await scopeToTargetInstance(query, { instances: matched, targetInstance })

	const reportInstances: ReportInstance[] = []
	for (const instance of instances) {
		const instanceDiff = await diff({
			sourceQuery,
			targetQuery: query,
			sourceRootRef: scopeRef,
			instanceRootRef: instance,
			matchKey,
			omit: FRAME_OMIT_CHILD_TAGS,
		})
		reportInstances.push(
			await buildReportInstance(query, {
				instanceDiff,
				instance,
				sourceQuery,
				sourceRef: scopeRef,
			}),
		)
	}
	return reportInstances
}
