import type { Scl } from '@/v2019C1/config'
import type { FsdFunctionRef, Resolution } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

/** A copy inside one document: the verb, the element copied and the parent it is pasted under, by record id. */
export type CopyCase =
	| { verb: 'fsd'; ref: FsdFunctionRef; anchor: Scl.Ref<Scl.ElementsOf> }
	| { verb: 'asd'; ref: Scl.Ref<'Application'>; anchor: Scl.Ref<Scl.ElementsOf> }

export type CopyParams = {
	/** The document the element is copied in: the source and the target of the copy. */
	document: Scl.Document
	copy: CopyCase
	/** What the consumer resolved, given to the report and to the apply. */
	resolution?: Resolution
	/** The decisions of the consumer, read from the report. Default: none, every group at its suggested action. */
	decide?: (report: DiffReport) => NonNullable<Resolution['decisions']>
}
