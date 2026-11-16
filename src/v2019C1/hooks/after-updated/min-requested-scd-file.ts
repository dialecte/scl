import { widen } from '@dialecte/core/helpers'

import {
	MIN_REQUESTED_SCD_DESCRIPTIVE_ATTRIBUTES,
	MIN_REQUESTED_SCD_IED_IGNORED_ATTRIBUTES,
} from '@/v2019C1/constants'
import { LINEAGE } from '@/v2019C1/extensions/lifecycle/constraints'
import {
	changedAttributeNames,
	hasAttributeChange,
	resolveAffectedIeds,
	resolveConnectedApOwner,
	syncMinRequestedScdFiles,
} from '@/v2019C1/hooks/shared'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Sync the IEDs affected by an updated trigger, or by an updated IED itself, to the current SCD.
 * The update counts when it changes the element's text or a relevant attribute;
 * reassigning a `ConnectedAP` to another IED (its `apUuid` or, without one, its `iedName` changed) syncs both the
 * former and the new IED.
 *
 * @stopgap Stamps at edit time with the Header version current during the edit, so the entry is one
 * version behind when the version is bumped after editing. Remove once a Header version change
 * stamps the IEDs changed since the previous version change (needs the store to list the records
 * changed since then).
 */
export async function syncMinRequestedScdFileOnUpdate<GenericElement extends Scl.ElementsOf>(
	query: Core.Query<Config>,
	params: {
		oldRecord: Scl.RawRecord<GenericElement>
		newRecord: Scl.RawRecord<GenericElement>
	},
): Promise<Scl.Operation[]> {
	const oldRecord = widen(params.oldRecord)
	const newRecord = widen(params.newRecord)

	if (!isConfigurationChange({ oldRecord, newRecord })) return []

	const iedRefs =
		newRecord.tagName === 'IED'
			? [{ tagName: 'IED' as const, id: newRecord.id }]
			: await resolveAffectedIeds(query, { record: newRecord })

	const isConnectedApReassigned =
		newRecord.tagName === 'ConnectedAP' &&
		hasAttributeChange({ oldRecord, newRecord, names: ['iedName', 'apUuid'] })
	// the IED it belonged to, read from its former version as its current one is
	if (isConnectedApReassigned) {
		const formerIed = await resolveConnectedApOwner(query, { connectedAp: oldRecord })
		if (formerIed) iedRefs.push(formerIed)
	}

	return syncMinRequestedScdFiles(query, { iedRefs })
}

function isConfigurationChange(params: {
	oldRecord: Scl.RawRecord<Scl.ElementsOf>
	newRecord: Scl.RawRecord<Scl.ElementsOf>
}): boolean {
	const { oldRecord, newRecord } = params
	if (oldRecord.value !== newRecord.value) return true

	return changedAttributeNames({ oldRecord, newRecord }).some(
		(name) =>
			!LINEAGE.has(name) &&
			!MIN_REQUESTED_SCD_DESCRIPTIVE_ATTRIBUTES.has(name) &&
			(newRecord.tagName !== 'IED' || !MIN_REQUESTED_SCD_IED_IGNORED_ATTRIBUTES.has(name)),
	)
}
