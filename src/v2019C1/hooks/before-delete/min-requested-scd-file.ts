import { toRawRecord, widen } from '@dialecte/core/helpers'

import { MIN_REQUESTED_SCD_IED_TRIGGER_TAGS } from '@/v2019C1/constants'
import {
	resolveAffectedIeds,
	resolveAncestorIed,
	syncMinRequestedScdFiles,
} from '@/v2019C1/hooks/shared'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Sync the IEDs affected by deleting `record` and its subtree to the current SCD.
 *
 * Runs before the deletion, while the subtree is still readable. The sync only reads the `Header`
 * and the IED's own `MinRequestedSCDFiles`, which the deletion leaves intact, so its result is the
 * same as after the deletion. Deleting an IED itself syncs nothing.
 */
export async function syncMinRequestedScdFileOnDelete<GenericElement extends Scl.ElementsOf>(
	query: Core.Query<Config>,
	params: { record: Scl.RawRecord<GenericElement> },
): Promise<Scl.Operation[]> {
	const record = widen(params.record)
	if (record.tagName === 'IED') return []

	const iedRefs = await resolveDeletedSubtreeIeds(query, { record })
	return syncMinRequestedScdFiles(query, { iedRefs })
}

async function resolveDeletedSubtreeIeds(
	query: Core.Query<Config>,
	params: { record: Scl.RawRecord<Scl.ElementsOf> },
): Promise<Scl.Ref<'IED'>[]> {
	const { record } = params

	const ownIeds = await resolveAffectedIeds(query, { record })
	if (ownIeds.length > 0) return ownIeds

	if (record.tagName === 'Communication') {
		return resolveCommunicationIeds(query, { communicationId: record.id })
	}

	const ied = await resolveAncestorIed(query, { record })
	if (!ied) return []

	const holdsTrigger = await containsIedTrigger(query, { record })
	return holdsTrigger ? [ied] : []
}

async function resolveCommunicationIeds(
	query: Core.Query<Config>,
	params: { communicationId: string },
): Promise<Scl.Ref<'IED'>[]> {
	const { communicationId } = params

	const subNetworks = await query.getChildren(
		{ tagName: 'Communication', id: communicationId },
		'SubNetwork',
	)
	const iedRefs: Scl.Ref<'IED'>[] = []
	for (const subNetwork of subNetworks) {
		const subNetworkIeds = await resolveAffectedIeds(query, {
			record: widen(toRawRecord(subNetwork)),
		})
		iedRefs.push(...subNetworkIeds)
	}
	return iedRefs
}

/** Whether the subtree below `record` holds IED trigger content; stops at the first one found. */
async function containsIedTrigger(
	query: Core.Query<Config>,
	params: { record: Scl.RawRecord<Scl.ElementsOf> },
): Promise<boolean> {
	const { record } = params

	const hasTriggerChild = record.children.some((childRef) =>
		MIN_REQUESTED_SCD_IED_TRIGGER_TAGS.has(childRef.tagName),
	)
	if (hasTriggerChild) return true

	for (const childRef of record.children) {
		const child = await query.getRecord(childRef)
		if (!child) continue

		const childHoldsTrigger = await containsIedTrigger(query, {
			record: widen(toRawRecord(child)),
		})
		if (childHoldsTrigger) return true
	}
	return false
}
