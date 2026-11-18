import type { Scl } from '@/v2019C1/config'

/** What a path names as the tests compare it: the element and the qualifier, `undefined` for nothing. */
export type Answer = { tagName: string; id: string; qualifier?: string } | undefined

/** A referrer of a fixture and what its path names; `created` names the element the staged writes create. */
export type Referrer = { ref: Scl.Ref<Scl.ElementsOf>; answer: Answer | 'created' }

/** The store reads and the records they move. */
export type Reads = { storeReads: number; recordsMoved: number }
