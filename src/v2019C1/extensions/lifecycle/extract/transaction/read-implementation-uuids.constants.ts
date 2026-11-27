import type { CollectSelect } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry.types'

/** The part of the document an LNode's binding, data and specified inputs and outputs may name: the IEDs. */
export const IED_SECTIONS_SELECT = { IED: true } satisfies CollectSelect
