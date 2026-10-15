import type { Scl } from '@/v2019C1/config'

export type ResetLNodesParams = {
	/**
	 * The elements to look at: an `LNode` for the logical node it is bound to, a `DOS` / `SDS` /
	 * `DAS` / `SourceRef` / `ControlRef` for the names it gives; any other is left aside. Absent:
	 * every one of the document.
	 */
	elements?: readonly Scl.Ref<Scl.ElementsOf>[]
}
