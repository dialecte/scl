import type { AddEntryParams } from './add-entry.types'

/**
 * How the file an operation writes starts: a new file (a uuid of its own, version `0`, revision `1`), or a new
 * revision of an existing file (its uuid, its version, the next revision).
 */
export type FileStart = 'new' | 'revision'

export type StartFileParams = Omit<AddEntryParams, 'header'> & {
	/** How the file starts: see {@link FileStart}. */
	as: FileStart
	header: Omit<AddEntryParams['header'], 'id' | 'version'>
}
