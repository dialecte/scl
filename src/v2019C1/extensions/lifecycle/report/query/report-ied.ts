import { buildReportInstance } from './report-instance'

import { assembleReport, diff } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { assertIedPlacementOffered } from '@/v2019C1/extensions/lifecycle/layers/ied/assert-ied-placement'
import { describeIedCommunication } from '@/v2019C1/extensions/lifecycle/layers/ied/place-ied-communication'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'

import type { WithCompanionParams } from './report-ied.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffPolicy } from '@/v2019C1/extensions/lifecycle/engine/diff-policy.types'
import type { DiffReport, InstanceDiff } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'
import type * as Core from '@dialecte/core'

/**
 * Report (read-only) what placing an IED of a source file in the project would add: a first placement, one
 * instance with no root in the project, every element of the IED added, on the fast track (`needsDecisions: false`),
 * and what its Communication part adds to the project's (its access points' `ConnectedAP`s, a subnetwork the project
 * lacks) as companions of the IED's group, as `apply` writes them.
 * An IED name the project already holds does not change the track.
 *
 * Only a first placement of a template is reported: the IED of an ISD instance file, or `template` / `fork` finding
 * the IED already in the project, is refused with `OPTION_NOT_AVAILABLE` (see `assertIedPlacementOffered`).
 */
export async function reportIed(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		iedRef: Scl.Ref<'IED'>
		/** The root of the project the IED is placed under. */
		anchor: Scl.Ref<'SCL'>
		scenario?: LifecycleScenario
		/** The type of file the source is, from its extension. */
		fileType: SclFileType | undefined
		diffPolicy: DiffPolicy
		placeholderLineages?: PlaceholderLineages
	},
): Promise<DiffReport> {
	const { sourceQuery, iedRef, scenario = 'template', fileType } = params
	await assertIedPlacementOffered(query, {
		sourceQuery,
		iedRef,
		scenario,
		fileType,
		operation: 'report (ied)',
	})

	const iedDiff = await diff({
		sourceQuery,
		targetQuery: query,
		sourceRootRef: iedRef,
		diffPolicy: params.diffPolicy,
		placeholderLineages: params.placeholderLineages,
	})
	// the IED's connections to the project's subnetworks, as the apply pours them, ride the IED's group
	const communication = await describeIedCommunication(query, {
		sourceQuery,
		iedRef,
		anchor: params.anchor,
		matchKey: scenarioPolicy({ scenario }).matchKey,
		diffPolicy: params.diffPolicy,
		placeholderLineages: params.placeholderLineages,
	})
	const instanceDiff = withCompanion({ instanceDiff: iedDiff, iedRef, companion: communication })
	const reportInstance = await buildReportInstance(query, {
		instanceDiff,
		instance: undefined,
		sourceQuery,
		sourceRef: iedRef,
	})
	return assembleReport({ instances: [reportInstance], templateRoots: [reportInstance] })
}

/**
 * The IED's diff with what its Communication adds folded into the IED's group, when it adds anything. As for the
 * other verbs' satellites, the report's `summary` counts the IED's own tree, not its companions.
 */
function withCompanion(params: WithCompanionParams): InstanceDiff {
	const { instanceDiff, iedRef, companion } = params
	if (!companion) return instanceDiff
	// what the Communication part leaves out naming outside the placement is told of, whatever it adds
	const referencesNotPlaced = [
		...(instanceDiff.referencesNotPlaced ?? []),
		...(companion.referencesNotPlaced ?? []),
	]
	const told = referencesNotPlaced.length > 0 ? { referencesNotPlaced } : {}
	if (companion.summary.added === 0) return { ...instanceDiff, ...told }
	const groups = instanceDiff.groups.map(function withCommunication(group) {
		if (group.primary.sourceRef?.id !== iedRef.id) return group
		return { ...group, companions: [...group.companions, companion.root] }
	})
	return { ...instanceDiff, groups, ...told }
}
