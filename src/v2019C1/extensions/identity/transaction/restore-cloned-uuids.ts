import { cloneAttributeValue } from './clone-attribute'

import { readAttribute } from '@/v2019C1/helpers'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * For a fork only: give each element the fork cloned the `uuid` of its source element back, so the
 * forked revision keeps the source's identities. Never for a clone or copy inside one document,
 * where two elements would then share a `uuid`.
 *
 * Why it is enough: a clone always mints FRESH element uuids (`beforeClone`
 * strips the element `uuid`, the standardize hook fills a new one) but copies every
 * REFERENCE uuid attribute verbatim — and a fork's add path does NOT run
 * `reference.applyUuidRemap`, so those refs stay pointing at their SOURCE uuids.
 *
 * A fork converges the target to the SAME identity as the source revision, so it is
 * enough to restore each cloned element's `uuid` back to its source uuid: an intra-clone
 * ref (e.g. a `SourceRef` bound to a sibling `LNode` added in the same revision) is
 * already coherent, because both the ref and its target were left in source space.
 *
 * @intent keep source uuids on a fork, restore element uuids after forking a document, fork a revision with the same identities
 */
export async function restoreClonedUuids(
	tx: Core.Transaction<Config>,
	params: { cloneMappings: readonly Scl.CloneMapping[] },
): Promise<void> {
	const { cloneMappings } = params

	for (const mapping of cloneMappings) {
		const sourceUuid = cloneAttributeValue({ attributes: mapping.source.attributes, name: 'uuid' })
		if (!sourceUuid) continue
		const target = await tx.getRecord(mapping.target)
		const freshUuid = target ? readAttribute({ record: target, name: 'uuid' }) : undefined
		if (!freshUuid || freshUuid === sourceUuid) continue
		await tx.update(mapping.target, { attributes: { uuid: sourceUuid } })
	}
}
