import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import {
	reportedElement,
	reportTargetOf,
} from '@/v2019C1/extensions/lifecycle/report/report-target'
import { REPORT_TARGET_FIELDS } from '@/v2019C1/extensions/lifecycle/report/report-target.constants'

import type { Config } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type {
	DiffReport,
	ReportedElement,
	ReportTarget,
	ReportTargetField,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/**
 * Refuse, before anything is written, a report applied to another target than the one it was made for (or carrying
 * none: `REPORT_TARGET_MISMATCH`), then a report naming an element the document no longer holds — an instance it
 * covers, an element one of its mappings or one of the consumer's choices lands on (`REPORT_STALE`).
 */
export async function assertReportFits(
	tx: Core.Transaction<Config>,
	params: { report: DiffReport; target: LifecycleTarget; decisionMappings?: DecisionMappings },
): Promise<void> {
	const { report, target, decisionMappings } = params
	const made = report.target
	if (!made) refuseTarget({ field: 'report' })
	const asked = await reportTargetOf(tx, target)
	const field = REPORT_TARGET_FIELDS.find((name) => !sameTargetField({ made, asked, name }))
	if (field) refuseTarget({ field })

	for (const instance of report.templateInstances) {
		await assertStillHeld(tx, { element: instance, kind: 'instance' })
	}
	const reportMappings = [
		...report.mappings,
		...report.instances.flatMap((instance) => instance.mappings),
	]
	for (const { mapping } of reportMappings) {
		if (mapping && 'existing' in mapping) {
			await assertStillHeld(tx, { element: mapping.existing, kind: 'mapping' })
		}
	}
	for (const choice of decisionMappings?.values() ?? []) {
		if ('existing' in choice)
			await assertStillHeld(tx, { element: choice.existing, kind: 'mapping' })
	}
}

/** Whether a field of the target a report was made for is the one asked for: elements by tag and record id. */
function sameTargetField(params: {
	made: ReportTarget
	asked: ReportTarget
	name: keyof ReportTarget
}): boolean {
	const { made, asked, name } = params
	const madeValue = made[name]
	const askedValue = asked[name]
	if (typeof madeValue === 'object' && typeof askedValue === 'object') {
		return madeValue.tagName === askedValue.tagName && madeValue.id === askedValue.id
	}
	return madeValue === askedValue
}

function refuseTarget(params: { field: ReportTargetField }): never {
	const { field } = params
	return throwDialecteError(SCL_ERRORS.REPORT_TARGET_MISMATCH, {
		meta: { field },
		detail:
			field === 'report'
				? 'the report carries no target: it was not made by query.lifecycle.report'
				: `the report was made for another ${field} than the one it is applied to`,
	})
}

/** Refuse a report naming an element the document no longer holds. */
async function assertStillHeld(
	tx: Core.Transaction<Config>,
	params: { element: AnyRefOrRecord; kind: 'instance' | 'mapping' },
): Promise<void> {
	const { kind } = params
	if (await tx.any.getRecord(params.element)) return
	const element: ReportedElement = reportedElement(params.element)
	throwDialecteError(SCL_ERRORS.REPORT_STALE, {
		meta: { element, kind },
		detail: `the report names <${element.tagName}> "${element.id}" (${kind}), which the document no longer holds`,
	})
}
