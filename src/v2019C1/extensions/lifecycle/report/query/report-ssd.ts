import { reportAsd } from './report-asd'
import { reportFsd } from './report-fsd'
import { reportTopologyFrame } from './report-topology-frame'

import { assembleReport } from '@/v2019C1/extensions/lifecycle/engine/diff'
import {
	resolveInstantiableRoot,
	resolveTopologyReconcilables,
} from '@/v2019C1/extensions/lifecycle/layers/topology'

import type { Scl, Config } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffReport, ReportInstance } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * Report (read-only) what instantiating / updating an SSD would change: the union of the
 * per-primary reports for the scope's Applications (each cascading to its composed Functions,
 * via {@link reportAsd}) and its standalone Functions ({@link reportFsd}). The instances are
 * merged into one {@link DiffReport}, so `groups` covers every primary and the fast/full
 * classification holds across the whole SSD.
 *
 * The scope defaults to the SSD's instantiable root.
 */
export async function reportSsd(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		scopeRef?: Scl.Ref<TopologyStructuralTag>
		targetParent: Scl.Ref<Scl.ElementsOf>
		scenario?: LifecycleScenario
		targetInstance?: Scl.Ref<Scl.ElementsOf>
	},
): Promise<DiffReport> {
	const { sourceQuery, scopeRef, targetParent, scenario, targetInstance } = params

	const root = scopeRef ?? (await resolveInstantiableRoot(sourceQuery))
	if (!root) return assembleReport([])

	const { applications, standaloneFunctions } = await resolveTopologyReconcilables(
		sourceQuery,
		root,
	)

	const instances: ReportInstance[] = []

	// the topology frame's own structural changes (Bay attrs / BayType / equipment), fn/app excluded;
	// one ReportInstance per bay when a bay-typical was instantiated more than once
	const frameInstances = await reportTopologyFrame(query, {
		sourceQuery,
		scopeRef: root,
		scenario,
		targetInstance,
	})
	instances.push(...frameInstances)

	for (const applicationRef of applications) {
		const report = await reportAsd(query, { sourceQuery, applicationRef, scenario, targetInstance })
		instances.push(...report.instances)
	}
	for (const functionRef of standaloneFunctions) {
		const report = await reportFsd(query, {
			sourceQuery,
			functionRef,
			targetParent,
			scenario,
			targetInstance,
		})
		instances.push(...report.instances)
	}

	return assembleReport(instances)
}
