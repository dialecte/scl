import { CORPUS_LOADERS, CORPUS_PAIR_LOADERS } from './corpus-loaders.constants'

/**
 * A revision of a family of the corpus, by its path under the corpus folder: the latest is in the smoke, the others in
 * the pairs. Throws when the corpus is not synced: ask {@link areCorpusRevisionsSynced} first.
 */
export async function readCorpusRevision(path: string): Promise<string> {
	const load = CORPUS_LOADERS[path] ?? CORPUS_PAIR_LOADERS[path]
	if (!load) throw new Error(`${path}: not synced (npm run corpus:sync)`)
	return load()
}

/** Whether every revision named is synced: a test of a pair runs only then. */
export function areCorpusRevisionsSynced(paths: readonly string[]): boolean {
	return paths.every((path) => path in CORPUS_LOADERS || path in CORPUS_PAIR_LOADERS)
}
