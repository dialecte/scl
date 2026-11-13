import type { TargetLineages } from './target-lineages.types'
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
 * stands for (`redirectedSourceUuids`). The project side brings back only what a source element stands for, and reads
 * any other uuid as it is when the source is another document (`readsSourceUuids`): a reference naming an element an
 * earlier placement made names it by its own uuid, never the source's; one naming the source's uuid was written by
 * this placement.
 */
export type ReferenceIdentitySide =
	| { side: 'source' }
	| {
			side: 'instance'
			matchKey: MatchKey
			redirectedSourceUuids?: RedirectedSourceUuids
			/** The lineage of what the instance's references name, read once: see `readTargetLineages`. */
			targetLineages: TargetLineages
	  }
	| {
			side: 'project'
			redirectedSourceUuids?: RedirectedSourceUuids
			/** A uuid the source and the project both name is the source's element: false when the source is the project. */
			readsSourceUuids: boolean
	  }
