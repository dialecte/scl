import { readAttribute } from '@/v2019C1/helpers'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Fork identity restore. A clone always mints FRESH element uuids (`beforeClone`
 * strips the element `uuid`, the standardize hook fills a new one) but copies every
 * REFERENCE uuid attribute verbatim — and a fork's add path does NOT run
 * `reference.applyUuidRemap`, so those refs stay pointing at their SOURCE uuids.
 *
 * A fork converges the target to the SAME identity as the source revision, so it is
 * enough to restore each cloned element's `uuid` back to its source uuid: an intra-clone
 * ref (e.g. a `SourceRef` bound to a sibling `LNode` added in the same revision) is
 * already coherent, because both the ref and its target were left in source space.
 */
export async function restoreClonedUuids(
	tx: Core.Transaction<Config>,
	params: { cloneMappings: readonly Scl.CloneMapping[] },
): Promise<void> {
	const { cloneMappings } = params

	for (const mapping of cloneMappings) {
		const sourceUuid = sourceAttributeValue({ attributes: mapping.source.attributes, name: 'uuid' })
		if (!sourceUuid) continue
		const target = await tx.getRecord(mapping.target)
		const freshUuid = target ? readAttribute({ record: target, name: 'uuid' }) : undefined
		if (!freshUuid || freshUuid === sourceUuid) continue
		await tx.update(mapping.target, { attributes: { uuid: sourceUuid } })
	}
}

/** An attribute value of a clone mapping's source, which carries its attributes, not a record. */
function sourceAttributeValue(params: {
	attributes: readonly { name: string; value: string }[]
	name: string
}): string | undefined {
	const { attributes, name } = params
	return attributes.find((attribute) => attribute.name === name)?.value
}
