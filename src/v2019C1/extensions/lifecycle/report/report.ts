import { reportAsd, reportFsd, reportSsd } from './query'

import { editableAttributes } from '@/v2019C1/extensions/lifecycle/constraints'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { assertMappingsCoherent, createReportPass } from '@/v2019C1/extensions/lifecycle/mapping'

import type { Config } from '@/v2019C1/config'
import type { LifecycleReportParams } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
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
 */
export async function report(
	query: Core.Query<Config>,
	target: LifecycleReportParams,
): Promise<DiffReport> {
	// what the report lists and names is shared by all it describes: the names it gives to the
	// elements to create are those apply gives them, one after the other
	const pass = createReportPass()
	const report =
		target.verb === 'fsd'
			? await reportFsd(query, {
					pass,
					sourceQuery: target.sourceQuery,
					functionRef: target.ref,
					targetParent: target.anchor,
					scenario: target.scenario,
					targetInstance: target.targetInstance,
					decisionMappings: target.resolution?.mappings,
					resolvePlacement: true,
				})
			: target.verb === 'ssd'
				? await reportSsd(query, {
						pass,
						sourceQuery: target.sourceQuery,
						// the SSD scope is the instantiable root (first named element below the TEMPLATE scaffolding), resolved
						// from the source - not `target.ref`, which is only the coarse process-section anchor.
						targetParent: target.anchor,
						scenario: target.scenario,
						targetInstance: target.targetInstance,
						decisionMappings: target.resolution?.mappings,
					})
				: await reportAsd(query, {
						pass,
						sourceQuery: target.sourceQuery,
						applicationRef: target.ref,
						scenario: target.scenario,
						targetInstance: target.targetInstance,
						decisionMappings: target.resolution?.mappings,
						anchor: target.anchor,
						resolvePlacement: true,
					})

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

	// a mapping nothing is decided for is the consumer's to choose before anything is written
	if (report.mappings.some((mapping) => !mapping.mapping)) report.needsDecisions = true

	// the report was derived from the consumer's mapping choices: refuse the ones it cannot honour
	const decisionMappings = target.resolution?.mappings
	if (decisionMappings)
		assertMappingsCoherent({ reportMappings: report.mappings, decisionMappings })

	return report
}
