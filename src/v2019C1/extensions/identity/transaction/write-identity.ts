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
	if (mode === 'keep') return

	for (const mapping of mappings) {
		const updates = mode === 'strip' ? stripLineage() : stampLineage(mapping)
		if (Object.keys(updates).length === 0) continue

		const target = await tx.getRecord(mapping.target)
		if (!target) continue
		await tx.update(target, { attributes: updates })
	}
}

type LineageUpdates = Record<string, string | undefined>

function stripLineage(): LineageUpdates {
	return { templateUuid: undefined, originUuid: undefined }
}

function stampLineage(mapping: Scl.CloneMapping): LineageUpdates {
	const sourceUuid = readAttribute(mapping.source.attributes, 'uuid')
	const sourceTemplateUuid = readAttribute(mapping.source.attributes, 'templateUuid')
	const sourceOriginUuid = readAttribute(mapping.source.attributes, 'originUuid')

	const updates: LineageUpdates = {}
	if (sourceUuid) updates.templateUuid = sourceUuid

	const carriesOriginLineage = supportsOriginUuid(mapping.target.tagName)
	if (sourceTemplateUuid && !sourceOriginUuid && carriesOriginLineage) {
		updates.originUuid = sourceTemplateUuid
	}

	return updates
}

/** Whether the element type's schema defines an `originUuid` attribute. */
function supportsOriginUuid(tagName: string): boolean {
	const attributes =
		SCL_DIALECTE_CONFIG.attributes[tagName as keyof typeof SCL_DIALECTE_CONFIG.attributes]
	return attributes ? 'originUuid' in attributes : false
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
