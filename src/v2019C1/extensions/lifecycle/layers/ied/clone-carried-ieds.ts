import { applyRecordEdits } from './apply-record-edits'

import { deep } from '@/v2019C1/extensions/lifecycle/transplant/transaction/deep'

import type { CloneCarriedIedsParams } from './clone-carried-ieds.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Write several IEDs carried together: each IED whole with the data types it uses (names kept from the source), but
 * what the cut of their references leaves out, its edits applied; then their Communication sections, with what the
 * communication reading leaves out. The IEDs keep what they hold of their own provenance (their source files, their
 * minimum SCD files) and their lineage. Returns every clone mapping, for the one identity pass of the caller.
 */
export async function cloneCarriedIeds(
	tx: Core.Transaction<Config>,
	params: CloneCarriedIedsParams,
): Promise<Scl.CloneMapping[]> {
	const { sourceQuery, targetParent, ieds, references, communication } = params
	const cloneMappings: Scl.CloneMapping[] = []
	for (const ied of ieds) {
		const cloned = await deep(tx, {
			sourceQuery,
			ref: ied,
			targetParent,
			leaveOut: references.leaveOut,
			withTypes: { keepNameFrom: 'source' },
		})
		cloneMappings.push(...cloned.cloneMappings)
	}
	await applyRecordEdits(tx, { edits: references.edits, cloneMappings })
	for (const ref of communication.communicationRefs) {
		const cloned = await deep(tx, {
			sourceQuery,
			ref,
			targetParent,
			withTypes: false,
			leaveOut: communication.leaveOut,
		})
		cloneMappings.push(...cloned.cloneMappings)
	}
	return cloneMappings
}
