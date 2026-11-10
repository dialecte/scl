import type { Scl } from '@/v2019C1/config'

/** A logical node of the document's own content, with the IED holding it. */
export type NativeLogicalNode = {
	ln: Scl.TrackedRecord<'LN' | 'LN0'>
	ied: Scl.Ref<'IED'>
}
