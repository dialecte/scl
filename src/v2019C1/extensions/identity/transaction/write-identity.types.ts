import type { Scl } from '@/v2019C1/config'

/** How to write instance-lineage identity onto the target records of a clone. */
export type IdentityMode = 'strip' | 'stamp-template' | 'keep'

/** The mode of a write, with what that mode reads besides the clone mappings. */
export type IdentityWrite =
	| {
			/**
			 * `stamp-template`: a new instance — the source's uuid becomes the template lineage, its origin is conserved.
			 * `keep`: the source's own elements — lineage as the clone copied it.
			 */
			mode: 'stamp-template' | 'keep'
	  }
	| {
			/** A new template: the elements named in `unlinked` lose their template link, every other keeps its lineage. */
			mode: 'strip'
			/** The source record ids of the elements whose template link the operation breaks. */
			unlinked: ReadonlySet<string>
	  }

export type WriteIdentityParams = {
	/** The clone mappings of the operation: each carries the source record's attributes, lineage included. */
	cloneMappings: readonly Scl.CloneMapping[]
} & IdentityWrite

/** The lineage an element is written with: an absent key removes the attribute. */
export type LineageUpdates = { templateUuid?: string; originUuid?: string }
