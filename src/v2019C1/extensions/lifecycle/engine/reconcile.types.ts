import type { Scl } from '@/v2019C1/config'
import type { ScenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'

/**
 * What a reconcile wrote: each source record it added and the copy made of it (root and descendants of each subtree
 * grafted), and, on a contribution, where the source's identified elements landed on elements the project holds — a
 * reference to such a source element is a reference to that one.
 */
export type ReconcileResult = {
	cloneMappings: Scl.CloneMapping[]
	landedOn: RedirectMapping[]
}

/**
 * How a reconcile writes what it adds: with the scenario's identity (`identityMode`), or — a contribution
 * (`contributeOnly`) — leaving it to the placement it is part of, which finalizes everything it places at once.
 *
 * A contribution is a first placement onto an element the project already holds, as `diff` reads it with the same
 * flag: nothing the project holds is rewritten, whoever made it — no attribute below the root is written —, each
 * reference of the source is the placement's own (added, unless the child it lands beside already names the very element
 * it names), and the result lists where the source's identified elements landed (`landedOn`).
 */
export type ReconcileAdditions =
	| { identityMode: ScenarioPolicy['identityMode']; contributeOnly?: false }
	| { identityMode?: undefined; contributeOnly: true }
