import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Fork identity restore (the operation-owned counterpart to the context-free clone
 * hooks). A clone always mints FRESH uuids (`beforeClone` strips them, the standardize
 * hook fills new ones, `reference.applyUuidRemap` repoints refs onto them). For a **fork** that
 * is wrong: a fork converges the target to the SAME identity as the source
 * revision, so a newly added element must keep its SOURCE uuid.
 *
 * Adding an element during a fork is the only place that knows this intent, so it fixes it here rather
 * than leaking intent into a global hook: using the clone `mappings` (source carries the
 * original uuid), restore each cloned element's uuid to its source uuid, then repoint any
 * INTRA-clone uuid reference from the fresh clone uuid back to the source uuid — all in
 * the same transaction (dependent path attrs are rebuilt by the `afterUpdated` hook).
 */
export async function restoreClonedUuids(
	tx: Core.Transaction<Config>,
	params: { mappings: readonly Scl.CloneMapping[] },
): Promise<void> {
	const { mappings } = params

	// fresh clone uuid -> source uuid, for the elements whose identity we restore
	const remap = new Map<string, string>()
	const restores: { ref: Scl.CloneMapping['target']; sourceUuid: string }[] = []

	for (const mapping of mappings) {
		const sourceUuid = readAttribute(mapping.source.attributes, 'uuid')
		if (!sourceUuid) continue
		const target = await tx.getRecord(mapping.target)
		const freshUuid = target
			? target.attributes.find((attribute) => attribute.name === 'uuid')?.value
			: undefined
		if (!freshUuid || freshUuid === sourceUuid) continue
		remap.set(freshUuid, sourceUuid)
		restores.push({ ref: mapping.target, sourceUuid })
	}

	if (remap.size === 0) return

	// 1. restore each cloned element's identity to its source uuid
	for (const { ref, sourceUuid } of restores) {
		await tx.update(ref, { attributes: { uuid: sourceUuid } })
	}

	// 2. repoint any intra-clone uuid reference (fresh -> source) so a ref between two
	//    added elements stays coherent after their identities are restored
	for (const mapping of mappings) {
		const pairs = UUID_REFERENCE_PAIRS[mapping.target.tagName as keyof typeof UUID_REFERENCE_PAIRS]
		if (!pairs) continue
		const record = await tx.getRecord(mapping.target)
		if (!record) continue
		const updates: Record<string, string> = {}
		for (const pair of pairs) {
			const current = record.attributes.find(
				(attribute) => attribute.name === pair.attribute.uuid,
			)?.value
			const restored = current ? remap.get(current) : undefined
			if (restored) updates[pair.attribute.uuid] = restored
		}
		if (Object.keys(updates).length > 0) await tx.update(mapping.target, { attributes: updates })
	}
}

function readAttribute(
	attributes: readonly { name: string; value: string }[],
	name: string,
): string | undefined {
	return attributes.find((attribute) => attribute.name === name)?.value
}
