/// <reference types="vite/client" />
import type { CorpusLoader } from './corpus.types'

/**
 * The SCL files of the source folder of the corpus (`SCL_CORPUS_SOURCE`), by their path as the glob gives it: read
 * where they are, never copied. Only the corpus-excluded project resolves the alias; empty without a source folder.
 */
export const CORPUS_SOURCE_LOADERS: Readonly<Record<string, CorpusLoader>> =
	import.meta.glob<string>('@scl-corpus-source/**/*.{fsd,asd,ssd,xml,FSD,ASD,SSD,XML}', {
		query: '?raw',
		import: 'default',
	})
