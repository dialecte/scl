import type { LifecycleScenario } from './contract.types'
import type { IdentityMode } from '@/v2019C1/extensions/identity/transaction/write-identity.types'

/**
 * How an instance element is matched to a source element during diff/reconcile:
 *  - `templateUuid` — instance carries `templateUuid = source.uuid` (instantiate/template);
 *  - `uuid` — source and target are two revisions of the SAME file, sharing `uuid` (fork).
 */
export type MatchKey = 'uuid' | 'templateUuid'

/**
 * The match key a scenario reconciles by. `fork` matches by `uuid` (same-file
 * revision); every other scenario matches an instance by its `templateUuid`
 * lineage. Derived once at the verb boundary so the engine stays scenario-agnostic.
 */
export function matchKeyForScenario(scenario: LifecycleScenario | undefined): MatchKey {
	return scenario === 'fork' ? 'uuid' : 'templateUuid'
}

/**
 * The identity write mode a scenario applies to added/reconciled elements. `fork`
 * KEEPS identity (same-file revision — no re-stamp, no provenance); every other
 * scenario stamps template lineage onto a fresh instance.
 */
export function identityModeForScenario(scenario: LifecycleScenario | undefined): IdentityMode {
	return scenario === 'fork' ? 'keep' : 'stamp-template'
}
