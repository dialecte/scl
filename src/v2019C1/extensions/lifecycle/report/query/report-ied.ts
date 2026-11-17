import { buildReportInstance } from './report-instance'
import { reportSsd } from './report-ssd'

import { toRef } from '@dialecte/core/helpers'

import { assembleReport, diff } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { assertIedPlacementOffered } from '@/v2019C1/extensions/lifecycle/layers/ied/assert-ied-placement'
import { readInstanceRedirects } from '@/v2019C1/extensions/lifecycle/layers/ied/instance-redirects'
import { linkSpecificationBindings } from '@/v2019C1/extensions/lifecycle/layers/ied/link-specification-bindings'
import { markOtherIedBindings } from '@/v2019C1/extensions/lifecycle/layers/ied/mark-other-ied-bindings'
import { describeIedCommunication } from '@/v2019C1/extensions/lifecycle/layers/ied/place-ied-communication'
import { readIedSpecification } from '@/v2019C1/extensions/lifecycle/layers/ied/read-ied-specification'
import { resolveIedInstance } from '@/v2019C1/extensions/lifecycle/layers/ied/resolve-ied-instance'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'

import type { ReportIedParams, WithCompanionParams } from './report-ied.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type {
	DiffReport,
	InstanceDiff,
	ReportInstance,
	ReportWarning,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * Report (read-only) what placing an IED of a source file in the project would add, or what a newer revision of its
 * template changes in the IED of the project placed from it (`scenario: 'template'`, the default): the one
 * `targetInstance` names, required when the project holds several (`TARGET_INSTANCE_REQUIRED`, see
 * `resolveIedInstance`); only a template ISD's IED is updated yet.
 *
 * A first placement: one instance with no root in the project, every element of the IED added, on the fast track
 * (`needsDecisions: false`), and what its Communication part adds to the project's (its access points' `ConnectedAP`s,
 * a subnetwork the project lacks) as companions of the IED's group, as `apply` writes them. An IED name the project
 * already holds does not change the track. The specification an ISD carries beside its IED (a substation section) is
 * reported as `report.ssd` reports a first placement of a substation scope, its instances after the IED's. An update
 * reports the IED's specification with it, as `report.ssd` reports an update of a substation scope.
 *
 * An ISD instance placed other than as a fork, a fork finding the IED in the project or a fork whose IED or
 * specification the project holds an element of by its uuid, is refused with `OPTION_NOT_AVAILABLE` (see
 * `assertIedPlacementOffered`).
 */
export async function reportIed(
	query: Core.Query<Config>,
	params: ReportIedParams,
): Promise<DiffReport> {
	const { sourceQuery, iedRef, scenario = 'template', fileType } = params
	const instance = await resolveIedInstance(query, {
		sourceQuery,
		iedRef,
		scenario,
		fileType,
		targetInstance: params.targetInstance,
		operation: 'report (ied)',
	})
	if (instance) return reportIedUpdate(query, { ...params, instance })
	return reportIedPlacement(query, { ...params, scenario })
}

/**
 * Report the first placement of the IED of a source file, with the specification an ISD carries beside it: see
 * `reportIed`.
 */
async function reportIedPlacement(
	query: Core.Query<Config>,
	params: ReportIedParams & { scenario: LifecycleScenario },
): Promise<DiffReport> {
	const { sourceQuery, iedRef, scenario, fileType } = params
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
	// an ISD carries the specification of its IED; another file's substation section is no part of the placement
	if (fileType !== 'ISD')
		return assembleReport({ instances: [reportInstance], templateRoots: [reportInstance] })
	// the specification beside the IED: a first placement, whatever a placement made earlier left in the project
	const specification = await reportSsd(query, {
		sourceQuery,
		targetParent: params.anchor,
		scenario: specificationScenario(scenario),
		decisionMappings: params.decisionMappings,
		pass: params.pass,
		diffPolicy: params.diffPolicy,
		placeholderLineages: params.placeholderLineages,
	})
	return withSpecification({ reportInstance, specification })
}

/**
 * One report of the IED and the specification beside it: the IED's instance first, the specification's after it, the
 * decisions the specification needs, the units it acts on and what it told of said for the whole.
 */
function withSpecification(params: {
	reportInstance: ReportInstance
	specification: DiffReport
}): DiffReport {
	const { reportInstance, specification } = params
	const report = assembleReport({
		instances: [reportInstance, ...specification.instances],
		templateRoots: [reportInstance],
	})
	if (specification.needsDecisions) report.needsDecisions = true
	if (specification.scopeUnits) report.scopeUnits = specification.scopeUnits
	if (specification.warnings) report.warnings = specification.warnings
	return report
}

/**
 * Report what a newer revision of its template changes in the IED of the project it was placed from: the IED's own
 * tree diffed with the template's (a logical node gained or dropped, a type changed, a value the project keeps), and what
 * the template's Communication part adds for it, as companions of the IED's group; then what it changes in the
 * specification beside the IED (see `reportSpecificationUpdate`), its instances after the IED's, an `LNode` it gains
 * depending on the logical node the IED gains for it.
 */
async function reportIedUpdate(
	query: Core.Query<Config>,
	params: ReportIedParams & { instance: AnyTrackedRecord },
): Promise<DiffReport> {
	const { sourceQuery, iedRef, instance } = params
	const { matchKey, namesFollow } = scenarioPolicy({ scenario: 'template' })
	const iedDiff = await diff({
		sourceQuery,
		targetQuery: query,
		sourceRootRef: iedRef,
		instanceRootRef: instance,
		matchKey,
		namesFollow,
		removalBase: params.removalBase,
		diffPolicy: params.diffPolicy,
		placeholderLineages: params.placeholderLineages,
	})
	// a connection of an access point the IED holds is the project's: the template's lands on it
	const redirectMappings = await readInstanceRedirects(query, { instance, matchKey })
	const communication = await describeIedCommunication(query, {
		sourceQuery,
		iedRef,
		anchor: params.anchor,
		matchKey,
		diffPolicy: params.diffPolicy,
		placeholderLineages: params.placeholderLineages,
		redirectMappings,
		keepsSubNetworkSettings: true,
	})
	const instanceDiff = withCompanion({ instanceDiff: iedDiff, iedRef, companion: communication })
	const reportInstance = await buildReportInstance(query, {
		instanceDiff,
		instance,
		sourceQuery,
		sourceRef: iedRef,
	})
	const specification = await reportSpecificationUpdate(query, params)
	if (!specification) {
		return assembleReport({ instances: [reportInstance], templateRoots: [reportInstance] })
	}
	// an LNode the specification gains goes with the logical node the IED gains for it
	await linkSpecificationBindings(sourceQuery, {
		iedGroups: reportInstance.groups,
		specificationGroups: specification.instances.flatMap((instance) => instance.groups),
	})
	return withSpecification({ reportInstance, specification })
}

/**
 * What a newer revision of a template ISD changes in the specification the placement of the IED put in the project, as
 * `report.ssd` reports an update of a substation scope, scoped to the IED's specification (see
 * `resolveSpecificationInstance`): another placement's on the same level is not reported. The project holding none of
 * it, it is reported as a first placement, as `reportIedPlacement` reports it. `undefined` for another file, or an ISD
 * carrying no specification.
 */
async function reportSpecificationUpdate(
	query: Core.Query<Config>,
	params: ReportIedParams & { instance: AnyTrackedRecord },
): Promise<DiffReport | undefined> {
	const { sourceQuery, instance } = params
	const specification = await readIedSpecification(query, {
		sourceQuery,
		fileType: params.fileType,
		iedRef: toRef(instance) as Scl.Ref<'IED'>,
	})
	if (!specification) return undefined
	const shared = {
		sourceQuery,
		targetParent: params.anchor,
		decisionMappings: params.decisionMappings,
		pass: params.pass,
		removalBase: params.removalBase,
		diffPolicy: params.diffPolicy,
		placeholderLineages: params.placeholderLineages,
	}
	const specificationInstance = specification.instance
	if (!specificationInstance) return reportSsd(query, { ...shared, scenario: 'instantiate' })
	const report = await reportSsd(query, {
		...shared,
		scenario: 'template',
		targetInstance: specificationInstance.frames,
		primaryTargets: specificationInstance.primaries,
		leftOut: specification.scope.leftOut,
		gainedIn: specificationInstance.gainedIn,
	})
	// a removal taking away the binding the project gave another IED waits for a decision
	markOtherIedBindings({
		groups: report.instances.flatMap((reportInstance) => reportInstance.groups),
		unbinding: specificationInstance.unbinding,
	})
	// what of the specification is not told apart is not updated: the report says so
	const unresolved = specificationInstance.unresolved.map((source): ReportWarning => ({
		code: 'specification-instance-unresolved',
		source,
	}))
	if (unresolved.length > 0) report.warnings = [...(report.warnings ?? []), ...unresolved]
	return report
}

/** The scenario the specification is placed with: a fork keeps the file's identity, any other places a new instance. */
function specificationScenario(scenario: LifecycleScenario): LifecycleScenario {
	return scenario === 'fork' ? 'fork' : 'instantiate'
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
