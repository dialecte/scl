import type { Scl } from '@/v2019C1/config'
import type { AnyRawRecord } from '@dialecte/core'

/** An element of a section of the document, with the elements above it, outermost first. */
export type SectionNode<GenericElement extends Scl.ElementsOf = Scl.ElementsOf> = {
	ref: Scl.Ref<GenericElement>
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
}
