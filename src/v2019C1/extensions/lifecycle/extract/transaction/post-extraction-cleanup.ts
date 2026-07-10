import { cleanUp } from '@/v2019C1/extensions/clean-up'

import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Universal post-extraction cleanup run after cloning records into a target DB.
 *
 * Phase 1 — Remap: orphanUuidRefs (clear/delete refs whose target is absent)
 * Phase 2 — Resolve orphan LNodes: resetLNode (reset IED bindings)
 * Phase 3 — Prune: pruneEmptyContainers (empty Private elements + empty ref containers)
 *
 * Same function runs for all extraction scopes (FSD, ASD, ISD).
 * Behavior differs based on target DB content.
 */
export async function postExtractionCleanup(tx: Core.Transaction<Config>): Promise<void> {
	await cleanUp.transaction.orphanUuidRefs(tx)
	await cleanUp.transaction.resetLNode(tx)
	await cleanUp.transaction.pruneEmptyContainers(tx)
}
