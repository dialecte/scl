import type { Scl } from '@/v2019C1/config'

/** Resolves the target-side parent ref an element should be cloned under. */
export type ResolveTargetParent = (ref: Scl.Ref<Scl.ElementsOf>) => Promise<Scl.Ref<Scl.ElementsOf>>
