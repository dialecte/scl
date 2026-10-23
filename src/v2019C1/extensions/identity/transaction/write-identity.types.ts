import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRef } from '@dialecte/core'

/** How to write instance-lineage identity onto the target records of a clone. */
export type IdentityMode = 'strip' | 'stamp-template' | 'preserve' | 'keep'

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
			/** A copy: lineage as the clone copied it, where the new parent is an instance of the same template. */
			mode: 'preserve'
			/** The document the clone was read from: where a cloned root's parent is read. */
			sourceQuery: Core.Query<Config>
			/**
			 * The source elements the operation cloned, as the source holds them (their tag before a clone retags them,
			 * a subfunction placed as a function): the record a cloned root's parent is read from. Every root the clone
			 * retagged must be listed; a root not listed is read under its cloned tag.
			 */
			sourceRoots: readonly AnyRef[]
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
