import { isSclXsdConfigured } from '../scl-xsd'
import { assertCorpusFileImport, assertCorpusFileValid } from './corpus-smoke'
import { CORPUS_SOURCE_LOADERS } from './corpus-source-loaders.constants'
import { CORPUS_EXCLUDED, CORPUS_EXCLUDED_TITLE_SEPARATOR } from './corpus.constants'

import { describe, it } from 'vitest'

import type { CorpusLoader } from './corpus.types'

/**
 * The checks of the corpus, run on each file the sync leaves out, read in the source folder (never copied): a case
 * that passes is a file that no longer needs to be excluded (the expert saved it again), a case that fails one still
 * invalid. A file the source does not hold is skipped. Run on demand by `npm run corpus:check-excluded`, which lists
 * the files that now pass. Skipped without a source folder or the schema files.
 */
export function runCorpusExcludedCheck(): void {
	const synced = Object.keys(CORPUS_SOURCE_LOADERS).length > 0 && isSclXsdConfigured()

	describe.skipIf(!synced)('the files the corpus leaves out', () => {
		for (const [file, exclusion] of Object.entries(CORPUS_EXCLUDED)) {
			const load = sourceLoaderOf(file)
			const title = `${file}${CORPUS_EXCLUDED_TITLE_SEPARATOR}${exclusion.reason}`
			it.skipIf(!load)(title, async function checkExcludedFile() {
				const xml = await load!()
				await assertCorpusFileValid({ file, xml })
				await assertCorpusFileImport({ file, xml })
			})
		}
	})
}

/**
 * The loader of a file of the source, by its path under the source folder: of the glob paths ending with it, the
 * shortest (a copy below a folder of the source, an `old` one, is always longer).
 */
function sourceLoaderOf(file: string): CorpusLoader | undefined {
	const [key] = Object.keys(CORPUS_SOURCE_LOADERS)
		.filter((path) => path.endsWith(`/${file}`))
		.sort((left, right) => left.length - right.length)
	return key ? CORPUS_SOURCE_LOADERS[key] : undefined
}
