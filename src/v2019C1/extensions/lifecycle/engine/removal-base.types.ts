import type { Config } from '@/v2019C1/config'
import type { ScenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * What the update holds, read once for one report or apply: what tells that an element of the project the source lacks
 * was dropped from it, and, in a fork of the file itself, the scope of its re-targets:
 *  - `none` — nothing: a new instance removes nothing;
 *  - `lineage` — the lineage the element carries: the template no longer holds the element it was made from;
 *  - `revision` — the uuids of the previous revision of the file: it held the element, the newer one does not;
 *  - `no-revision` — a fork given no previous revision: nothing tells a dropped element from one the project added,
 *    so every element the newer revision lacks is the project's own.
 * A fork's `holds` (see `ForkHolds`) is the re-target scope; absent, nothing is re-targeted.
 */
export type RemovalBase =
	| { kind: 'none' }
	| { kind: 'lineage' }
	| ({ kind: 'revision'; uuids: ReadonlySet<string> } & ForkHolds)
	| ({ kind: 'no-revision' } & ForkHolds)

/**
 * A fork of the file itself (its open document a version of the newer revision's file, see `readUpdateHolds`): the
 * uuids the references of the newer revision name that the update holds — the open document's, and the newer
 * revision's but what sits under a primary the update leaves out. A reference the newer revision points at one of them
 * is re-targeted by its uuid; at another, kept, the report warns. Absent (a fork into a project): no re-target.
 */
export type ForkHolds = {
	holds?: ReadonlySet<string>
}

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
	/**
	 * The open document: given, a fork of the file itself records what the update holds (`ForkHolds`). Left out where
	 * the verb records it itself (an IED's, which leaves out part of its specification).
	 */
	target?: Core.Query<Config> | Core.Transaction<Config>
}

export type ClassifyUnmatchedParams = {
	/** The element's tag: a level of the topology is told apart by more than its lineage. */
	tagName: string
	/** The element's lineage under the scenario's key: its `templateUuid`, or its own uuid for a fork. */
	lineage: string
	/** The source holds an element of that uuid. */
	inSource: boolean
	removalBase: RemovalBase
}

export type ClassifyUnpairedReferenceParams = {
	/** The reference's tag. */
	tagName: string
}

/**
 * A primary of the project the source no longer holds — an application or a function of a placed unit, a function an
 * application no longer composes — with what it is: dropped by the source, or the project's own.
 */
export type DroppedElement = {
	element: AnyTrackedRecord
	change: Exclude<UnmatchedClass, 'still-held'>
}
