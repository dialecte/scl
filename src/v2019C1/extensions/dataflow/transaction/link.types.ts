import type { Scl } from '@/v2019C1/config'

export type LinkParams = {
	/** The signal to link: a `SourceRef` to the `ExtRef`, a `ControlRef` to the `ExtCtrl`, implementing it. */
	signal: Scl.Ref<'SourceRef' | 'ControlRef'>
	/** The element implementing the signal. */
	implementation: Scl.Ref<'ExtRef' | 'ExtCtrl'>
}

/** An element, as an error names it. */
export type LinkedElement = { tagName: string; id: string }

/** What `DATAFLOW_LINK_TARGET_MISMATCH` says it is about. */
export type LinkTargetMismatchMeta = {
	signal: LinkedElement
	implementation: LinkedElement
}
