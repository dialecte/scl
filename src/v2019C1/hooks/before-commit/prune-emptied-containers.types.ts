import type { Scl } from '@/v2019C1/config'

/** An element the commit pass judges, by its tag and record id. */
export type PruneCandidate = Scl.Ref<Scl.ElementsOf> & { id: string }
