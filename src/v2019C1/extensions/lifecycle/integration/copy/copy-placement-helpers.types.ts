import type { Scl } from '@/v2019C1/config'

/** A function the report places: the element its row lands it under, and the name it proposes. */
export type PromisedLanding = { parent: Scl.Ref<Scl.ElementsOf>; name: string }
