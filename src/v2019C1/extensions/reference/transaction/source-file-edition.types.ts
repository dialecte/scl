/** The SCL edition a file states on its root: `version`, `revision` and `release`, each when given. */
export type SclEdition = { version?: string; revision?: string; release?: string }

export type CompareEditionsParams = { edition: SclEdition; other: SclEdition }
