import type { TypeReads } from '@/v2019C1/extensions/data-model/query/unused-types.types'
import type { DecisionGroup } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { AnyRawRecord } from '@dialecte/core'

/** The LNodes of the project, read once for a whole report when a removal deletes a logical node. */
export type LNodeReads = { read: () => Promise<AnyRawRecord[]> }

/** What one group's removal side effects are read with: the reads shared by the report, and the elements that stay. */
export type SideEffectReadParams = {
	group: DecisionGroup
	typeReads: TypeReads
	lnodeReads: LNodeReads
	/** Elements the update moves out of what it removes: they do not go with the removal. */
	stays: ReadonlySet<string>
}
