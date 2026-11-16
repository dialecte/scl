import type { ConstraintScope } from './find-constraint-violation.types'
import type * as Core from '@dialecte/core'

export type ScopesTellingTargetsApartParams = {
	scope: ConstraintScope
	/** The tag of the element compared. */
	tagName: string
	/** Its attribute values. */
	candidate: Record<string, string | undefined>
}

export type ReadLiveTargetUuidsParams = {
	/** The tag of the siblings. */
	childTag: string
	children: readonly Core.AnyTreeRecord[]
}
