import type { Scl } from '@/v2019C1/config'

/** A parent and the signal tag of the children read under it. */
export type SignalPlace = { parent: Scl.Ref<Scl.ElementsOf>; tagName: string }
