import { getAttributeRules } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'

import type { IdentityMode } from './write-identity.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Writes instance-lineage identity onto the target records of a clone, driven by
 * the clone mappings (each carries the source record's original attributes, so
 * no cross-document query is needed).
 *
 * - `stamp-template` (instantiate / update): rotate lineage so the source
 *   identity becomes the template lineage of a fresh instance —
 *   `templateUuid <- source.uuid` and `originUuid <- source.templateUuid` (only
 *   when the origin slot is free and the element type carries a two-level
 *   lineage). The instance `uuid` is already fresh from `deepClone`.
 * - `strip` (extract): drop `templateUuid` and `originUuid`, leaving a fresh template.
 * - `preserve` (copy/paste): carry `templateUuid`/`originUuid` verbatim onto the fresh
 *   instance uuid — the copy stays an instance of the SAME template. Written as a no-op
 *   because the clone already copied the lineage attributes verbatim (callers pass `strip:false`).
 * - `keep` (fork): leave lineage untouched.
 */
export async function writeIdentity(
	tx: Core.Transaction<Config>,
	params: {
		mappings: readonly Scl.CloneMapping[]
		mode: IdentityMode
	},
): Promise<void> {
	const { mappings, mode } = params
	// `keep` and `preserve` both leave lineage as the clone copied it; they diverge only in
	// the post-step (`restoreClonedUuids` vs `applyUuidRemap`), owned by `finalizeClonedIdentity`.
	if (mode === 'keep' || mode === 'preserve') return

	for (const mapping of mappings) {
		const target = await tx.getRecord(mapping.target)
		if (!target) continue

		const updates = mode === 'strip' ? stripLineage() : stampLineage({ mapping, target })
		if (Object.keys(updates).length === 0) continue
		await tx.update(target, { attributes: updates })
	}
}

type LineageUpdates = Record<string, string | undefined>

function stripLineage(): LineageUpdates {
	return { templateUuid: undefined, originUuid: undefined }
}

function stampLineage(params: {
	mapping: Scl.CloneMapping
	/** The target record: its parent says which declaration of the element applies. */
	target: Core.AnyTrackedRecord
}): LineageUpdates {
	const { mapping, target } = params
	const sourceUuid = readAttribute(mapping.source.attributes, 'uuid')
	const sourceTemplateUuid = readAttribute(mapping.source.attributes, 'templateUuid')
	const sourceOriginUuid = readAttribute(mapping.source.attributes, 'originUuid')

	const updates: LineageUpdates = {}
	if (sourceUuid) updates.templateUuid = sourceUuid

	const carriesOriginLineage = getAttributeRules({
		dialecteConfig: SCL_DIALECTE_CONFIG,
		record: target,
		attributeName: 'originUuid',
	}).isDefined
	if (sourceTemplateUuid && !sourceOriginUuid && carriesOriginLineage) {
		updates.originUuid = sourceTemplateUuid
	}

	return updates
}

/**
 * Reads one attribute value from a clone mapping's raw source attributes. The
 * source lives in another document, so `query.getAttributes` does not apply here.
 */
function readAttribute(
	attributes: readonly { name: string; value: string }[],
	name: string,
): string | undefined {
	return attributes.find((attribute) => attribute.name === name)?.value
}
