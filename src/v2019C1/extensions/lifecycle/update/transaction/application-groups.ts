import { groupsForInstance } from '@/v2019C1/extensions/lifecycle/engine/decide'
import { readAttribute } from '@/v2019C1/helpers'

import type { Config, Scl } from '@/v2019C1/config'
import type {
	DecisionGroup,
	DiffReport,
	ReportInstance,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * The groups an update brought to an application instance, read once the update is written: its own, those of the
 * functions it composes (each listed as an instance of its own, named by its references — a function taken where it
 * stood is named once the reference to it is repointed), and those of the placements made for it — listed for that
 * instance, or listed once when the report holds that one instance of the application. A placement can be accepted
 * while the reference to it is declined: it is read on its own.
 */
export async function groupsOfApplicationInstance(
	tx: Core.Transaction<Config>,
	params: {
		report: DiffReport | undefined
		instance: AnyTrackedRecord
	},
): Promise<DecisionGroup[]> {
	const { report, instance } = params
	if (!report) return []
	const instanceRef = { tagName: 'Application', id: instance.id } as Scl.Ref<'Application'>
	const { FunctionRef: references = [] } = await tx.findDescendants(instanceRef, {
		collect: 'FunctionRef',
	})
	const composed = new Set(
		references.map((functionRef) => readAttribute({ record: functionRef, name: 'functionUuid' })),
	)
	const soleInstance =
		report.instances.filter((listed) => listed.rootRef?.tagName === 'Application').length === 1

	const groups = [...groupsForInstance(report, instance.id)]
	for (const listed of report.instances) {
		if (await belongsToInstance(tx, { listed, instance, composed, soleInstance })) {
			groups.push(...listed.groups)
		}
	}
	return groups
}

/** Whether a report instance is a function of the application instance, or a placement made for it. */
async function belongsToInstance(
	tx: Core.Transaction<Config>,
	params: {
		listed: ReportInstance
		instance: AnyTrackedRecord
		composed: ReadonlySet<string>
		soleInstance: boolean
	},
): Promise<boolean> {
	const { listed, instance, composed, soleInstance } = params
	const { rootRef, placedFor } = listed
	if (!rootRef) return placedFor ? placedFor.id === instance.id : soleInstance
	if (rootRef.id === instance.id) return false
	const root = await tx.any.getRecord(rootRef)
	const uuid = root ? readAttribute({ record: root, name: 'uuid' }) : ''
	return uuid !== '' && composed.has(uuid)
}
