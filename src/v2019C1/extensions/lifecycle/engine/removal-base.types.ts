import type { Config } from '@/v2019C1/config'
import type { ScenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'

/**
 * What tells, in one report or apply, that an element of the project the source lacks was dropped from it:
 *  - `none` — nothing: a new instance removes nothing;
 *  - `lineage` — the lineage the element carries: the template no longer holds the element it was made from;
 *  - `revision` — the uuids of the previous revision of the file: it held the element, the newer one does not;
 *  - `no-revision` — a fork given no previous revision: nothing tells a dropped element from one the project added,
 *    so every element the newer revision lacks is the project's own.
 */
export type RemovalBase =
	| { kind: 'none' }
	| { kind: 'lineage' }
	| { kind: 'revision'; uuids: ReadonlySet<string> }
	| { kind: 'no-revision' }

/**
 * An element of the project that matched no source element, by its lineage under the scenario's key:
 *  - `removed` — the source dropped it: removed when its removal is accepted (suggested);
 *  - `target-only` — the project's own: kept unless its removal is explicitly accepted;
 *  - `still-held` — the source still holds the element it carries the lineage of, elsewhere: not this element's
 *    to remove.
 */
export type UnmatchedClass = 'removed' | 'target-only' | 'still-held'

export type ResolveRemovalBaseParams = {
	policy: Pick<ScenarioPolicy, 'removalBase'>
	/** The newer revision, or the template. */
	sourceQuery: Core.Query<Config>
	/** The previous revision of the file, when a fork is given it. */
	baseQuery?: Core.Query<Config>
}

export type ClassifyUnmatchedParams = {
	/** The element's lineage under the scenario's key: its `templateUuid`, or its own uuid for a fork. */
	lineage: string
	/** The source holds an element of that uuid. */
	inSource: boolean
	removalBase: RemovalBase
}
