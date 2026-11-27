import type { SclEdition } from './source-file-edition.types'

/** The edition this dialecte reads, the first whose Header names its file with a uuid of its own: 2007 C 5. */
export const CURRENT_EDITION: SclEdition = { version: '2007', revision: 'C', release: '5' }

/** The edition a root stating no version is: the first, 2003, with no revision nor release. */
export const FIRST_EDITION: SclEdition = { version: '2003' }
