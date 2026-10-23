import { throwDialecteError } from '@dialecte/core'

import { restoreClonedUuids, writeIdentity } from '@/v2019C1/extensions/identity/transaction'
import { applyUuidRemap } from '@/v2019C1/extensions/reference/transaction'

import type { FinalizeClonedIdentityParams } from './finalize-cloned-identity.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Finalize the identity of a freshly cloned subtree in ONE place: write the lineage ({@link writeIdentity}, the only
 * writer of `templateUuid` / `originUuid`: the clone copied them as the source holds them) then fix up the uuids for
 * the mode. Every clone-then-place path goes through it (instantiate, update, reconcile, extract):
 *  - `keep` (fork) converges the clone to the source revision's uuids → {@link restoreClonedUuids}
 *    (no ref remap: refs were copied verbatim in source space and stay coherent).
 *  - `strip` / `stamp-template` / `preserve` all keep the fresh clone uuid → {@link applyUuidRemap}
 *    repoints the subtree's internal refs onto those fresh uuids.
 *
 * The two touch disjoint attribute sets (`writeIdentity` reads the source attributes and writes only lineage;
 * `applyUuidRemap` reads the fresh element uuids and writes only reference attributes), so the order is free.
 */
export async function finalizeClonedIdentity(
	tx: Core.Transaction<Config>,
	params: FinalizeClonedIdentityParams,
): Promise<void> {
	const { redirectMappings, ...write } = params
	const { cloneMappings } = write

	await writeIdentity(tx, write)

	switch (write.mode) {
		case 'keep':
			await restoreClonedUuids(tx, { cloneMappings })
			// refs were copied in source space; only the redirected ones need repointing
			if (redirectMappings?.length) await applyUuidRemap(tx, { cloneMappings, redirectMappings })
			return
		case 'strip':
		case 'stamp-template':
		case 'preserve':
			await applyUuidRemap(tx, { cloneMappings, redirectMappings })
			return
		default:
			throwDialecteError('ASSERTION_FAILED', {
				detail: `finalizeClonedIdentity: unhandled identity mode ${String(write satisfies never)}`,
			})
	}
}
