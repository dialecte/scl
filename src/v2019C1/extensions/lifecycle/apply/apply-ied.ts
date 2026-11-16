import { throwDialecteError } from '@dialecte/core'

import {
	annotateInstance,
	sourceToTargetMap,
} from '@/v2019C1/extensions/lifecycle/engine/correlate'
import {
	acceptedRefIds,
	collisionOverrides,
	firstTimeGroups,
	firstTimeReportInstance,
} from '@/v2019C1/extensions/lifecycle/engine/decide'
import { ied as instantiateIed } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'

import type { ApplyIedParams } from './apply-ied.types'
import type { AppliedInstance } from './apply.types'
import type { Config } from '@/v2019C1/config'
import type { PlacedIedFileType } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'
import type * as Core from '@dialecte/core'

/**
 * Write the first placement of an IED a report lists: the IED placed as a new one (`instantiate.ied`), unless its group
 * is skipped, then each report node annotated with what it became. What the report does not offer yet is refused
 * before anything is written, with `OPTION_NOT_AVAILABLE`: the IED of an ISD instance file or one the project already
 * holds (checked again by `instantiate.ied`, so a report applied twice is refused), or one read from an IID or an SCD.
 */
export async function applyIed(
	tx: Core.Transaction<Config>,
	params: ApplyIedParams,
): Promise<AppliedInstance<'IED'>[]> {
	const { target, report, decisions } = params
	const { sourceQuery, ref: iedRef } = target
	const fileType = report.target?.fileType
	const placedType = placedFileType(fileType)

	// the first placement is one group: skipped, nothing is written
	const groups = firstTimeGroups(report, {})
	const gate = acceptedRefIds({ groups, decisions })
	if (!gate.sourceIds.has(iedRef.id)) return []

	const placed = await instantiateIed(tx, {
		sourceQuery,
		iedRef,
		anchor: target.anchor,
		fileType: placedType,
		// the report's default: a placement it made is not placed a second time
		scenario: target.scenario ?? 'template',
		overrides: collisionOverrides({ groups, decisions }),
		keepNameTypesFrom: target.resolution?.keepNameTypesFrom,
		placeholderLineages: params.placeholderLineages,
	})
	const reportInstance = firstTimeReportInstance(report, { sourceRootId: iedRef.id })
	if (reportInstance) {
		annotateInstance({ reportInstance, added: sourceToTargetMap(placed.cloneMappings) })
	}
	return [{ ref: placed.iedRef, placement: 'placed' }]
}

/** The type of file an IED is placed from: the report refused another. */
function placedFileType(fileType: SclFileType | undefined): PlacedIedFileType {
	if (fileType === 'ISD' || fileType === 'ICD') return fileType
	return throwDialecteError('ASSERTION_FAILED', {
		detail: `apply (ied): an IED is placed from an ISD or an ICD, not from ${String(fileType)}`,
	})
}
