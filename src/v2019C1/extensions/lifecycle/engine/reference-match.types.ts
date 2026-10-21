import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'

/**
 * For each project element a source element was mapped onto: the project element's `uuid` -> the
 * source element's `uuid`. Such an element carries no lineage (it is the project's own), so this
 * is what tells a reference to it from the template reference it stands for.
 */
export type RedirectedSourceUuids = ReadonlyMap<string, string>

/**
 * The side a reference identity is read on. The source side reads the uuids a reference names as they are; the
 * instance side brings each back to the source: by the lineage its target carries under the scenario's key (a
 * target's `templateUuid`, or under `uuid` the target's uuid itself), or through the source element a project element
 * stands for (`redirectedSourceUuids`).
 */
export type ReferenceIdentitySide =
	| { side: 'source' }
	| { side: 'instance'; matchKey: MatchKey; redirectedSourceUuids?: RedirectedSourceUuids }
