/// <reference types="vite/client" />
import type { CorpusV2Loader } from './corpus-v2.types'

/** The folder the corpus is synced into, as the glob below names it. */
export const CORPUS_V2_GLOB_PREFIX = '../fixtures/corpus/v2/'

/** The synced corpus files, by their path under the corpus folder: empty when the corpus is not synced. */
export const CORPUS_V2_LOADERS: Readonly<Record<string, CorpusV2Loader>> = Object.fromEntries(
	Object.entries(
		import.meta.glob<string>('../fixtures/corpus/v2/**/*', { query: '?raw', import: 'default' }),
	).map(([path, load]) => [path.slice(CORPUS_V2_GLOB_PREFIX.length), load]),
)
