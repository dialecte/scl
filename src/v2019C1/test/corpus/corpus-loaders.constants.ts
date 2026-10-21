/// <reference types="vite/client" />
import type { CorpusLoader } from './corpus.types'

/** The folder the corpus is synced into, as the glob below names it. */
export const CORPUS_GLOB_PREFIX = '../fixtures/corpus/smoke/'

/** The synced corpus files, by their path under the corpus folder: empty when the corpus is not synced. */
export const CORPUS_LOADERS: Readonly<Record<string, CorpusLoader>> = Object.fromEntries(
	Object.entries(
		import.meta.glob<string>('../fixtures/corpus/smoke/**/*', { query: '?raw', import: 'default' }),
	).map(([path, load]) => [path.slice(CORPUS_GLOB_PREFIX.length), load]),
)

/** The folder the other revisions of a family are synced into, as the glob below names it. */
export const CORPUS_PAIRS_GLOB_PREFIX = '../fixtures/corpus/pairs/'

/** The synced revision pairs, by their path under the pairs folder: empty when the corpus is not synced. */
export const CORPUS_PAIR_LOADERS: Readonly<Record<string, CorpusLoader>> = Object.fromEntries(
	Object.entries(
		import.meta.glob<string>('../fixtures/corpus/pairs/**/*', { query: '?raw', import: 'default' }),
	).map(([path, load]) => [path.slice(CORPUS_PAIRS_GLOB_PREFIX.length), load]),
)
