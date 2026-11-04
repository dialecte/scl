import { groupsForInstance } from '@/v2019C1/extensions/lifecycle/engine/decide'

import type {
	DecisionGroup,
	DiffReport,
	ReportInstance,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * The groups an update brought to an application instance: its own, those of the functions of the project it stands
 * on (each listed as an instance of its own: one it owns, and one it takes where it stands whether the reference the
 * update gives it to that function is accepted or not), and those of the placements made for it — listed for that
 * instance, or listed once when the report holds that one instance of the application. A placement can be accepted
 * while the reference to it is declined: it is read on its own.
 */
export function groupsOfApplicationInstance(params: {
	report: DiffReport | undefined
	instance: AnyTrackedRecord
	/** The record ids of the functions of the project the instance stands on, as the cascade resolved them. */
	standsOn: ReadonlySet<string>
}): DecisionGroup[] {
	const { report, instance, standsOn } = params
	if (!report) return []
	const soleInstance =
		report.instances.filter((listed) => listed.rootRef?.tagName === 'Application').length === 1

	const groups = [...groupsForInstance(report, instance.id)]
	for (const listed of report.instances) {
		if (belongsToInstance({ listed, instance, standsOn, soleInstance })) {
			groups.push(...listed.groups)
		}
	}
	return groups
}

/** Whether a report instance is a function the application instance stands on, or a placement made for it. */
function belongsToInstance(params: {
	listed: ReportInstance
	instance: AnyTrackedRecord
	standsOn: ReadonlySet<string>
	soleInstance: boolean
}): boolean {
	const { listed, instance, standsOn, soleInstance } = params
	const { rootRef, placedFor } = listed
	if (!rootRef) return placedFor ? placedFor.id === instance.id : soleInstance
	if (!rootRef.id || rootRef.id === instance.id) return false
	return standsOn.has(rootRef.id)
}
