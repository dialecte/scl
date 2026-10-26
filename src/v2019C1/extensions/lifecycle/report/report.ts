import { listRemovalSideEffects, reportAsd, reportFsd, reportSsd } from './query'
import { reportTargetOf } from './report-target'

import { throwDialecteError } from '@dialecte/core'

import { editableAttributes } from '@/v2019C1/extensions/lifecycle/constraints'
import { acceptedCollisions } from '@/v2019C1/extensions/lifecycle/engine'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { resolveRemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base'
import { assertMappingsCoherent, createReportPass } from '@/v2019C1/extensions/lifecycle/mapping'
import {
	assertRevisionBaseFits,
	scenarioPolicy,
} from '@/v2019C1/extensions/lifecycle/scenario-policy'

import type { Config } from '@/v2019C1/config'
import type { LifecycleReportParams } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { ReportPass } from '@/v2019C1/extensions/lifecycle/mapping'
import type * as Core from '@dialecte/core'

/**
 * `query.lifecycle.report` — the generic read-only classify surface.
 *
 * Dispatches on `verb` to the per-layer report and returns a {@link DiffReport} (one
 * {@link ReportInstance} per instance). `report.needsDecisions` tells the consumer the
 * track: `false` = fast (apply headless), `true` = full (resolve decisions first). The
 * consumer never picks the track — dialecte decides it here.
 *
 * Tags each decision group with its primary's editable attributes (schema-derived)
 * so the UI renders inputs straight from the report without re-deriving them.
 *
 * A fork reads the previous revision of the file it is given (`baseQuery`) once: an element the
 * project holds that the newer revision lacks is listed as removed when the previous revision held
 * it, as the project's own otherwise; `report.revisionBase` says whether it was given.
 */
export async function report(
	query: Core.Query<Config>,
	target: LifecycleReportParams,
): Promise<DiffReport> {
	// what the report lists and names is shared by all it describes: the names it gives to the
	// elements to create are those apply gives them, one after the other
	const pass = createReportPass()
	assertRevisionBaseFits({ scenario: target.scenario, baseQuery: target.baseQuery })
	const removalBase = await resolveRemovalBase({
		policy: scenarioPolicy({ scenario: target.scenario }),
		sourceQuery: target.sourceQuery,
		baseQuery: target.baseQuery,
	})
	const report = await reportVerb(query, { target, pass, removalBase })
	// what the report is made for: apply refuses it for another target
	report.target = await reportTargetOf(query, target)
	const revisionBase = revisionBaseOf(removalBase)
	if (revisionBase) report.revisionBase = revisionBase

	// as each primary's definition says where it sits - a type it names with xsi:type included -: the
	// project's element when it has one, the template's otherwise
	for (const group of allGroups(report)) {
		const { instanceRef, sourceRef, tagName } = group.primary
		const definition = instanceRef
			? await query.any.getDefinition(instanceRef)
			: sourceRef
				? await target.sourceQuery.any.getDefinition(sourceRef)
				: undefined
		group.editableAttributes = editableAttributes(tagName, definition?.attributes.sequence)
	}

	// what a removal makes the delete hooks do outside it, read before anything is decided
	await listRemovalSideEffects(query, { groups: allGroups(report) })

	// a mapping nothing is decided for is the consumer's to choose before anything is written
	if (report.mappings.some((mapping) => !mapping.mapping)) report.needsDecisions = true
	// an addition colliding on a key nothing can change cannot be written as it is suggested
	if (acceptedCollisions({ groups: allGroups(report), decisions: new Map() }).length > 0) {
		report.needsDecisions = true
	}

	// the report was derived from the consumer's mapping choices: refuse the ones it cannot honour
	const decisionMappings = target.resolution?.mappings
	if (decisionMappings)
		assertMappingsCoherent({ reportMappings: report.mappings, decisionMappings })

	return report
}

/**
 * The per-layer report of the target's verb. Each verb has its arm: a verb added to the contract
 * without one does not compile.
 */
async function reportVerb(
	query: Core.Query<Config>,
	params: { target: LifecycleReportParams; pass: ReportPass; removalBase: RemovalBase },
): Promise<DiffReport> {
	const { target, pass, removalBase } = params
	switch (target.verb) {
		case 'fsd':
			return reportFsd(query, {
				pass,
				sourceQuery: target.sourceQuery,
				functionRef: target.ref,
				targetParent: target.anchor,
				scenario: target.scenario,
				targetInstance: target.targetInstance,
				decisionMappings: target.resolution?.mappings,
				boundLogicalNodeTypes: target.resolution?.boundLogicalNodeTypes,
				resolvePlacement: true,
				removalBase,
			})
		case 'ssd':
			return reportSsd(query, {
				pass,
				sourceQuery: target.sourceQuery,
				scopeRef: target.ref,
				targetParent: target.anchor,
				scenario: target.scenario,
				targetInstance: target.targetInstance,
				decisionMappings: target.resolution?.mappings,
				boundLogicalNodeTypes: target.resolution?.boundLogicalNodeTypes,
				removalBase,
			})
		case 'asd':
			return reportAsd(query, {
				pass,
				sourceQuery: target.sourceQuery,
				applicationRef: target.ref,
				scenario: target.scenario,
				targetInstance: target.targetInstance,
				decisionMappings: target.resolution?.mappings,
				boundLogicalNodeTypes: target.resolution?.boundLogicalNodeTypes,
				anchor: target.anchor,
				resolvePlacement: true,
				removalBase,
			})
	}
}

/** What a fork's report says of its previous revision: given, or not. Nothing for another scenario. */
function revisionBaseOf(removalBase: RemovalBase): DiffReport['revisionBase'] {
	switch (removalBase.kind) {
		case 'revision':
			return 'given'
		case 'no-revision':
			return 'absent'
		case 'none':
		case 'lineage':
			return undefined
		default:
			return throwDialecteError('ASSERTION_FAILED', {
				detail: `report: unhandled removal base ${String(removalBase satisfies never)}`,
			})
	}
}
