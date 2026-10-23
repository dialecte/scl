import type { AnyTreeRecord } from '@dialecte/core'

/** A source-file reference an element records for itself: the wrapper holding it and the reference. */
export type OwnProvenance = {
	/** The element wrapping the reference (`FunctionSclRef`, `ApplicationSclRef`, ...). */
	wrapper: AnyTreeRecord
	/** The `SclFileReference` it holds. */
	reference: AnyTreeRecord
}
