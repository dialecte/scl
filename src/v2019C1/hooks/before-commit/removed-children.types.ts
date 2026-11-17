import type { Scl } from '@/v2019C1/config'

/** A child a transaction took out of an element: deleted, or moved under another parent. */
export type RemovedChild = { tagName: string; id: string; by: 'deleted' | 'moved' }

/** An element the transaction took children out of, with those children. */
export type RemovedChildren = { parent: Scl.Ref<Scl.ElementsOf>; children: RemovedChild[] }
