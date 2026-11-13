import { buildReportInstance } from './report-instance'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { assembleReport, diff } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { findInstancesByTemplateUuid } from '@/v2019C1/extensions/lifecycle/instance'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'
import { IED_ROOT_TAG } from '@/v2019C1/extensions/lifecycle/source-root/source-root.constants'

import type { Config, Scl } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffPolicy } from '@/v2019C1/extensions/lifecycle/engine/diff-policy.types'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type * as Core from '@dialecte/core'

/**
 * Report (read-only) what placing an IED of a source file in the project would add: a first placement, one
 * instance with no root in the project, every element of the IED added, on the fast track (`needsDecisions: false`).
 * An IED name the project already holds does not change the track.
 *
 * Only a first placement is reported: `template` or `fork` finding the IED already in the project (an IED carrying
 * its uuid as lineage, or as its own uuid for a fork) is refused with `OPTION_NOT_AVAILABLE`
 * (`meta: { option: 'scenario', value }`). `instantiate` places a new IED whatever the project holds.
 */
export async function reportIed(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		iedRef: Scl.Ref<'IED'>
		scenario?: LifecycleScenario
		diffPolicy: DiffPolicy
		placeholderLineages?: PlaceholderLineages
	},
): Promise<DiffReport> {
	const { sourceQuery, iedRef, scenario = 'template' } = params
	await assertFirstPlacement(query, { sourceQuery, iedRef, scenario })

	const instanceDiff = await diff({
		sourceQuery,
		targetQuery: query,
		sourceRootRef: iedRef,
		diffPolicy: params.diffPolicy,
		placeholderLineages: params.placeholderLineages,
	})
	const reportInstance = await buildReportInstance(query, {
		instanceDiff,
		instance: undefined,
		sourceQuery,
		sourceRef: iedRef,
	})
	return assembleReport({ instances: [reportInstance], templateRoots: [reportInstance] })
}

/** Refuse a scenario that reconciles an IED the project already holds: only a first placement is reported. */
async function assertFirstPlacement(
	query: Core.Query<Config>,
	params: { sourceQuery: Core.Query<Config>; iedRef: Scl.Ref<'IED'>; scenario: LifecycleScenario },
): Promise<void> {
	const { sourceQuery, iedRef, scenario } = params
	const { matchesInstances, matchKey } = scenarioPolicy({ scenario })
	if (!matchesInstances) return
	const sourceUuid = await sourceQuery.getAttribute(iedRef, { name: 'uuid' })
	const matched = await findInstancesByTemplateUuid(query, {
		tagName: IED_ROOT_TAG,
		sourceUuid,
		matchKey,
	})
	if (matched.length === 0) return
	throwDialecteError(SCL_ERRORS.OPTION_NOT_AVAILABLE, {
		meta: { option: 'scenario', value: scenario },
		detail: `report (ied): "${scenario}" finds the IED in the project, only a first placement is reported yet`,
	})
}
